"use strict";

const WNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
let lastReport = null;
let lastFilename = "manuscript";

document.getElementById("scanButton").addEventListener("click", scanSelectedFile);

function showError(message){
  const box=document.getElementById("error");
  box.textContent=message; box.style.display="block";
}
function clearError(){document.getElementById("error").style.display="none"}

async function scanSelectedFile(){
  clearError();
  const input=document.getElementById("file");
  if(!input.files.length){showError("Choose a DOCX manuscript first.");return}
  const file=input.files[0];
  if(!file.name.toLowerCase().endsWith(".docx")){showError("This prototype accepts DOCX files only.");return}
  document.getElementById("progress").style.display="block";
  document.getElementById("scanButton").disabled=true;
  try{
    const bytes=await file.arrayBuffer();
    const zip=new SimpleZip(bytes);
    await zip.initialize();
    const report=await inspectDocument(zip,getProfile());
    lastReport=report; lastFilename=file.name;
    renderReport(report,file.name);
  }catch(error){
    console.error(error);
    showError("The document could not be scanned. It may be damaged, encrypted, or use an unsupported compression feature. "+error.message);
  }finally{
    document.getElementById("progress").style.display="none";
    document.getElementById("scanButton").disabled=false;
  }
}

function getProfile(){
  const intOrNull=id=>{
    const v=document.getElementById(id).value.trim();
    return v===""?null:Number.parseInt(v,10);
  };
  return{
    abstractLimit:intOrNull("abstractLimit"),
    keywordMin:intOrNull("keywordMin"),
    keywordMax:intOrNull("keywordMax"),
    anonymousReview:document.getElementById("anonymousReview").checked,
    requiredSections:document.getElementById("requiredSections").value.split(",").map(x=>x.trim()).filter(Boolean)
  };
}

/* Minimal ZIP reader sufficient for modern DOCX files. */
class SimpleZip{
  constructor(buffer){this.buffer=buffer;this.view=new DataView(buffer);this.entries=new Map()}
  u16(o){return this.view.getUint16(o,true)}
  u32(o){return this.view.getUint32(o,true)}
  async initialize(){
    const end=this.findEndRecord();
    const count=this.u16(end+10);
    let offset=this.u32(end+16);
    const decoder=new TextDecoder("utf-8");
    for(let i=0;i<count;i++){
      if(this.u32(offset)!==0x02014b50)throw new Error("Invalid ZIP central directory.");
      const method=this.u16(offset+10);
      const compressedSize=this.u32(offset+20);
      const uncompressedSize=this.u32(offset+24);
      const nameLength=this.u16(offset+28);
      const extraLength=this.u16(offset+30);
      const commentLength=this.u16(offset+32);
      const localOffset=this.u32(offset+42);
      const nameBytes=new Uint8Array(this.buffer,offset+46,nameLength);
      const name=decoder.decode(nameBytes);
      this.entries.set(name,{method,compressedSize,uncompressedSize,localOffset});
      offset+=46+nameLength+extraLength+commentLength;
    }
  }
  findEndRecord(){
    const start=Math.max(0,this.buffer.byteLength-65557);
    for(let i=this.buffer.byteLength-22;i>=start;i--){
      if(this.u32(i)===0x06054b50)return i;
    }
    throw new Error("ZIP end record not found.");
  }
  has(name){return this.entries.has(name)}
  async text(name){
    const entry=this.entries.get(name);
    if(!entry) return null;
    const o=entry.localOffset;
    if(this.u32(o)!==0x04034b50)throw new Error("Invalid ZIP local header.");
    const nameLength=this.u16(o+26),extraLength=this.u16(o+28);
    const start=o+30+nameLength+extraLength;
    const compressed=new Uint8Array(this.buffer,start,entry.compressedSize);
    let output;
    if(entry.method===0){
      output=compressed;
    }else if(entry.method===8){
      if(typeof DecompressionStream==="undefined")throw new Error("This browser lacks local DOCX decompression support.");
      const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      output=new Uint8Array(await new Response(stream).arrayBuffer());
    }else{
      throw new Error("Unsupported ZIP compression method: "+entry.method);
    }
    return new TextDecoder("utf-8").decode(output);
  }
}

function xmlDoc(text){
  if(!text)return null;
  const doc=new DOMParser().parseFromString(text,"application/xml");
  if(doc.getElementsByTagName("parsererror").length)throw new Error("A DOCX XML part could not be parsed.");
  return doc;
}
function elementsByLocal(root,name){return Array.from(root.getElementsByTagNameNS("*",name))}
function attrVal(el){
  return el?.getAttributeNS(WNS,"val") || el?.getAttribute("w:val") || el?.getAttribute("val") || "";
}
function paragraphText(p){return elementsByLocal(p,"t").map(x=>x.textContent||"").join("").trim()}
function wordCount(text){return (text.match(/\b[\p{L}\p{N}’'-]+\b/gu)||[]).length}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function titleCase(s){return s.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}

async function inspectDocument(zip,profile){
  const documentXml=await zip.text("word/document.xml");
  if(!documentXml)throw new Error("word/document.xml is missing.");
  const doc=xmlDoc(documentXml);
  const commentsDoc=xmlDoc(await zip.text("word/comments.xml"));
  const coreDoc=xmlDoc(await zip.text("docProps/core.xml"));

  const paragraphs=elementsByLocal(doc,"p").map((p,index)=>{
    const pStyle=elementsByLocal(p,"pStyle")[0];
    const style=attrVal(pStyle);
    const text=paragraphText(p);
    const isHeading=/heading\s*\d+/i.test(style)||["references","bibliography","works cited","literature cited","abstract","summary"].includes(text.toLowerCase().replace(/:$/,""));
    const runs=elementsByLocal(p,"r").map(r=>{
      const rPr=elementsByLocal(r,"rPr")[0];
      const fonts=rPr?elementsByLocal(rPr,"rFonts")[0]:null;
      const sizeEl=rPr?elementsByLocal(rPr,"sz")[0]:null;
      return{
        text:elementsByLocal(r,"t").map(t=>t.textContent||"").join(""),
        font:fonts?(fonts.getAttributeNS(WNS,"ascii")||fonts.getAttribute("w:ascii")||""): "",
        size:sizeEl?Number(attrVal(sizeEl))/2:null
      };
    }).filter(r=>r.text);
    return{index,text,style,isHeading,runs}
  });

  const fullText=paragraphs.map(p=>p.text).filter(Boolean).join("\n");
  const referenceHeadings=new Set(["references","bibliography","works cited","literature cited"]);
  const refStart=paragraphs.findIndex(p=>referenceHeadings.has(p.text.toLowerCase().replace(/:$/,"")));
  const bodyParagraphs=refStart<0?paragraphs:paragraphs.slice(0,refStart);
  const refParagraphs=refStart<0?[]:paragraphs.slice(refStart+1);
  const bodyText=bodyParagraphs.map(p=>p.text).filter(Boolean).join("\n");
  const references=parseReferences(refParagraphs);
  const citations=extractCitations(bodyText);
  const comparison=compareCitations(citations,references);
  const issues=[];
  const add=(severity,category,title,detail,evidence=[])=>issues.push({severity,category,title,detail,evidence});

  const placeholders=[
    ["TODO marker",/\bTODO\b/gi],["TK marker",/(^|[^A-Z])TK([^A-Z]|$)/g],["XXX marker",/\bX{3,}\b/gi],
    ["Citation needed",/\[\s*citation needed\s*\]/gi],["Insert marker",/\[\s*insert[^\]]*\]/gi],
    ["Question marks",/\?{3,}/g],["Word cross-reference error",/Error!\s+(Reference source not found|Bookmark not defined)\.?/gi]
  ];
  const placeholderHits=placeholders.map(([label,re])=>({label,count:(fullText.match(re)||[]).length})).filter(x=>x.count);
  if(placeholderHits.length)add("high","Cleanup","Unresolved placeholders or Word errors detected","Remove temporary markers and broken cross-references before submission.",placeholderHits.map(x=>`${x.label}: ${x.count}`));

  const commentsCount=commentsDoc?elementsByLocal(commentsDoc,"comment").length:0;
  const trackedInsertions=elementsByLocal(doc,"ins").length;
  const trackedDeletions=elementsByLocal(doc,"del").length;
  if(commentsCount)add("high","Cleanup","Comments remain in the file","Comments can expose internal discussion or author identity.",[`Comments detected: ${commentsCount}`]);
  if(trackedInsertions||trackedDeletions)add("high","Cleanup","Tracked changes remain in the file","Accept or reject changes and inspect the final document.",[`Tracked insertions: ${trackedInsertions}`,`Tracked deletions: ${trackedDeletions}`]);

  const metadata=extractMetadata(coreDoc);
  const metadataEvidence=Object.entries(metadata).filter(([,v])=>v).map(([k,v])=>`${titleCase(k)}: ${v}`);
  if(profile.anonymousReview&&metadataEvidence.length)add("high","Anonymization","Document metadata may identify the author","Clear identifying core properties before double-anonymous submission.",metadataEvidence);

  const frontText=paragraphs.slice(0,25).map(p=>p.text).join("\n");
  const identityHits=[];
  identityHits.push(...new Set(frontText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)||[]));
  identityHits.push(...new Set(frontText.match(/\b(?:https?:\/\/orcid\.org\/)?\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b/gi)||[]));
  ["acknowledgment","acknowledgement","affiliation","university","department of"].forEach(p=>{if(frontText.toLowerCase().includes(p))identityHits.push(`Front matter contains “${p}”`)});
  if(profile.anonymousReview&&identityHits.length)add("high","Anonymization","Possible identifying information appears in the front matter","Inspect and remove or move these items if the journal requires anonymity.",identityHits.slice(0,20));

  if(comparison.citationsWithoutReferences.length)add("high","Citations","In-text citations may lack matching reference entries","Verify each item manually; name variants and complex group authors can cause false positives.",comparison.citationsWithoutReferences.slice(0,50).map(x=>x.display));
  if(comparison.referencesWithoutCitations.length)add("medium","Citations","Reference entries may not be cited in the manuscript","Remove unused entries or add the missing in-text citation where appropriate.",comparison.referencesWithoutCitations.slice(0,50).map(x=>x.display));
  if(refStart<0)add("high","Structure","No References or Bibliography heading was detected","Confirm that the manuscript contains a clearly labeled reference section.");

  const duplicates=findDuplicateReferences(references);
  if(duplicates.length)add("medium","References","Possible duplicate reference entries","Inspect duplicate-normalized entries and retain only the correct version.",duplicates.slice(0,30));

  const doiPattern=/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i;
  const malformed=references.filter(r=>/doi/i.test(r.text)&&!doiPattern.test(r.text)).map(r=>r.text.slice(0,240));
  if(malformed.length)add("medium","References","Entries mention a DOI but no valid DOI pattern was detected","Check DOI syntax and resolve truncated or malformed links.",malformed.slice(0,30));

  const headingLevels=paragraphs.map(p=>{
    const m=(p.style||"").match(/heading\s*(\d+)/i);return m&&p.text?[Number(m[1]),p.text]:null
  }).filter(Boolean);
  const skipped=[];let prev=null;
  headingLevels.forEach(([level,text])=>{if(prev!==null&&level>prev+1)skipped.push(`Heading level ${prev} → ${level}: ${text.slice(0,100)}`);prev=level});
  if(skipped.length)add("medium","Formatting","Heading levels appear to skip","Check whether the document moves directly to a deeper heading level.",skipped.slice(0,20));

  const outliers=fontOutliers(paragraphs);
  if(outliers.length)add("low","Formatting","Possible direct-formatting outliers","These may be intentional, but inconsistent direct font names or sizes often survive copy-and-paste.",outliers.slice(0,30));

  const abstract=extractAbstract(paragraphs,refStart);
  if(profile.abstractLimit!==null&&abstract.wordCount!==null&&abstract.wordCount>profile.abstractLimit)add("high","Journal profile","Abstract exceeds the configured limit",`Configured maximum: ${profile.abstractLimit} words.`,[`Detected abstract length: ${abstract.wordCount} words`]);
  else if(profile.abstractLimit!==null&&abstract.wordCount===null)add("medium","Journal profile","Abstract could not be located","Confirm its heading and placement.");

  const keywords=extractKeywords(paragraphs);
  if(profile.keywordMin!==null&&keywords.length<profile.keywordMin)add("medium","Journal profile","Too few keywords",`Configured minimum: ${profile.keywordMin}.`,[`Detected keywords: ${keywords.length}`]);
  if(profile.keywordMax!==null&&keywords.length>profile.keywordMax)add("medium","Journal profile","Too many keywords",`Configured maximum: ${profile.keywordMax}.`,[`Detected keywords: ${keywords.length}`]);

  const existingHeadings=paragraphs.filter(p=>p.isHeading).map(p=>p.text.trim().toLowerCase());
  const missingSections=profile.requiredSections.filter(required=>{
    const req=required.toLowerCase();return !existingHeadings.some(h=>h===req||h.includes(req))
  });
  if(missingSections.length)add("high","Journal profile","Required sections were not detected","Confirm whether these sections are required and whether the wording differs.",missingSections);

  const counts={
    total_words:wordCount(fullText),body_words:wordCount(bodyText),reference_entries:references.length,
    citation_keys_detected:citations.length,comments:commentsCount,tracked_insertions:trackedInsertions,
    tracked_deletions:trackedDeletions,keywords_detected:keywords.length,abstract_words:abstract.wordCount
  };
  const weights={high:12,medium:6,low:2};
  const score=Math.max(0,100-issues.reduce((sum,i)=>sum+weights[i.severity],0));
  const status=score>=85?"Ready for final human review":score>=65?"Revision recommended":"Substantial cleanup recommended";
  issues.sort((a,b)=>({high:0,medium:1,low:2}[a.severity]-({high:0,medium:1,low:2}[b.severity])));
  return{
    summary:{score,status,high:issues.filter(i=>i.severity==="high").length,medium:issues.filter(i=>i.severity==="medium").length,low:issues.filter(i=>i.severity==="low").length},
    counts,issues,citation_analysis:comparison,metadata,
    notes:["Heuristic preflight aid; verify flagged citations manually.","The scan is performed locally in the browser."]
  };
}

function extractMetadata(coreDoc){
  if(!coreDoc)return{};
  const get=name=>elementsByLocal(coreDoc,name)[0]?.textContent?.trim()||"";
  return{creator:get("creator"),last_modified_by:get("lastModifiedBy"),title:get("title"),subject:get("subject"),description:get("description")}
}

function parseReferences(paragraphs){
  const yearRe=/\b(19|20)\d{2}[a-z]?\b/i;
  return paragraphs.map(p=>{
    const text=p.text.trim();const ym=text.match(yearRe);
    if(!text||text.length<8||!ym)return null;
    const year=ym[0].toLowerCase();
    const lead=text.split(".",1)[0].trim().replace(/^\s*[-•]\s*/,"");
    const candidate=(lead.includes(",")?lead.split(",",1)[0]:(lead.split(/\s+/)[0]||"")).replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'’-]/g,"").toLowerCase();
    return{text,year,surname:candidate,key:candidate?`${candidate}|${year}`:null}
  }).filter(Boolean)
}

function extractCitations(text){
  const found=new Map();
  const groupRe=/\(([^()]{0,250}?(?:19|20)\d{2}[a-z]?[^()]*)\)/g;
  for(const match of text.matchAll(groupRe)){
    for(const part of match[1].split(";")){
      const years=part.match(/\b(?:19|20)\d{2}[a-z]?\b/gi)||[];
      if(!years.length)continue;
      const before=part.split(/(?:19|20)\d{2}[a-z]?/i,1)[0];
      const names=before.match(/\b[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’-]{1,40}\b/g)||[];
      const stop=new Set(["See","Cf","And","The","For","In","But","Also"]);
      const surname=names.find(n=>!stop.has(n));
      if(surname)years.forEach(year=>found.set(`${surname.toLowerCase()}|${year.toLowerCase()}`,{surname,year,display:`${surname} (${year})`}));
    }
  }
  const narrative=/\b([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’-]{1,40})(?:\s+et\s+al\.)?\s*\(((?:19|20)\d{2}[a-z]?)\)/g;
  for(const m of text.matchAll(narrative)){
    const surname=m[1],year=m[2];found.set(`${surname.toLowerCase()}|${year.toLowerCase()}`,{surname,year,display:`${surname} (${year})`})
  }
  return Array.from(found.values())
}

function compareCitations(citations,refs){
  const cm=new Map(citations.map(c=>[`${c.surname.toLowerCase()}|${c.year.toLowerCase()}`,c]));
  const rm=new Map(refs.filter(r=>r.key).map(r=>[r.key,r]));
  const citationsWithoutReferences=[...cm.keys()].filter(k=>!rm.has(k)).sort().map(k=>cm.get(k));
  const referencesWithoutCitations=[...rm.keys()].filter(k=>!cm.has(k)).map(k=>{
    const r=rm.get(k);return{...r,display:`${r.surname.charAt(0).toUpperCase()+r.surname.slice(1)} (${r.year}): ${r.text.slice(0,180)}`}
  });
  return{citationsWithoutReferences,referencesWithoutCitations,matchedCount:[...cm.keys()].filter(k=>rm.has(k)).length}
}

function findDuplicateReferences(refs){
  const map=new Map();
  refs.forEach(r=>{
    const key=r.text.toLowerCase().replace(/\W+/g,"");
    if(!map.has(key))map.set(key,[]);map.get(key).push(r.text)
  });
  return [...map.values()].filter(v=>v.length>1).map(v=>v[0].slice(0,240))
}

function fontOutliers(paragraphs){
  const fontCounts=new Map(),sizeCounts=new Map();
  const add=(m,k,n)=>{if(k!==null&&k!=="")m.set(k,(m.get(k)||0)+n)};
  paragraphs.filter(p=>!p.isHeading).forEach(p=>p.runs.forEach(r=>{add(fontCounts,r.font,r.text.length);add(sizeCounts,r.size,r.text.length)}));
  const most=m=>[...m.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]??null;
  const commonFont=most(fontCounts),commonSize=most(sizeCounts),out=[];
  paragraphs.filter(p=>!p.isHeading).forEach(p=>p.runs.forEach(r=>{
    if(r.text.trim().length<4)return;
    if(commonFont&&r.font&&r.font!==commonFont)out.push(`Paragraph ${p.index+1}: font ${r.font} in “${r.text.slice(0,70)}”`);
    if(commonSize&&r.size&&Math.abs(r.size-commonSize)>=1.5)out.push(`Paragraph ${p.index+1}: ${r.size} pt text in “${r.text.slice(0,70)}”`)
  }));
  return out
}

function extractAbstract(paragraphs,refStart){
  const upper=refStart<0?paragraphs.length:refStart;
  const headings=new Set(["abstract","summary"]);
  for(let i=0;i<upper;i++){
    if(headings.has(paragraphs[i].text.toLowerCase().replace(/:$/,""))){
      const collected=[];
      for(let j=i+1;j<upper;j++){
        const p=paragraphs[j];
        if(p.isHeading&&collected.length)break;
        if(/^\s*(key\s*words?|keywords?)\s*[:—-]/i.test(p.text))break;
        if(p.text)collected.push(p.text);
        if(wordCount(collected.join(" "))>1000)break;
      }
      const text=collected.join(" ");return{text,wordCount:wordCount(text)}
    }
  }
  return{text:"",wordCount:null}
}

function extractKeywords(paragraphs){
  for(const p of paragraphs){
    const m=p.text.match(/^\s*(?:key\s*words?|keywords?)\s*[:—-]\s*(.+)$/i);
    if(m)return m[1].split(/[,;]/).map(x=>x.trim()).filter(Boolean)
  }
  return[]
}

function renderReport(report,filename){
  document.getElementById("intake").style.display="none";
  document.getElementById("report").style.display="block";
  document.getElementById("reportFilename").textContent=filename;
  document.getElementById("score").textContent=`${report.summary.score}/100`;
  document.getElementById("status").textContent=report.summary.status;
  document.getElementById("highCount").textContent=report.summary.high;
  document.getElementById("mediumCount").textContent=report.summary.medium;
  document.getElementById("lowCount").textContent=report.summary.low;
  document.getElementById("counts").innerHTML=Object.entries(report.counts).map(([k,v])=>`<div class="count"><span class="muted">${escapeHtml(titleCase(k))}</span><b>${v===null?"—":escapeHtml(v)}</b></div>`).join("");
  const issues=document.getElementById("issues");
  if(!report.issues.length)issues.innerHTML='<div class="empty">No issues were detected by the current rule set. A final human review is still recommended.</div>';
  else issues.innerHTML=report.issues.map(i=>`<article class="issue ${i.severity}"><span class="sev">${escapeHtml(i.severity)} · ${escapeHtml(i.category)}</span><h3>${escapeHtml(i.title)}</h3><p>${escapeHtml(i.detail)}</p>${i.evidence?.length?`<ul>${i.evidence.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>`:""}</article>`).join("");
  document.getElementById("raw").textContent=JSON.stringify(report,null,2);
  window.scrollTo({top:0,behavior:"smooth"})
}

function resetApp(){
  lastReport=null;document.getElementById("report").style.display="none";document.getElementById("intake").style.display="block";document.getElementById("file").value="";window.scrollTo(0,0)
}
function downloadReport(){
  if(!lastReport)return;
  const blob=new Blob([JSON.stringify(lastReport,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=lastFilename.replace(/\.docx$/i,"")+"-preflight-report.json";a.click();URL.revokeObjectURL(url)
}
