let questions=[],key="";
const $=id=>document.getElementById(id);
const DRAFT_KEY="hssc_admin_form_draft_v1";
function saveDraft(){
 try{localStorage.setItem(DRAFT_KEY,JSON.stringify({title:$ ("title").value,description:$ ("description").value,duration:$ ("duration").value,questionCount:$ ("questionCount").value,questions}));}catch(e){}
}
function restoreDraft(){
 try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||"null");if(!d)return;
  if(d.title!==undefined)$("title").value=d.title;if(d.description!==undefined)$("description").value=d.description;
  if(d.duration!==undefined)$("duration").value=d.duration;if(d.questionCount!==undefined)$("questionCount").value=d.questionCount;
  if(Array.isArray(d.questions)){questions=d.questions;$ ("preview").textContent=questions.length?`${questions.length} saved questions restored from this browser.`:"No questions imported yet.";$ ("create").disabled=![25,50,100].includes(questions.length)||questions.length!==Number($("questionCount").value);}
 }catch(e){}
}
function connectWithKey(savedKey){key=savedKey;$("key").value=key;return connectDashboard();}
async function connectDashboard(){try{const s=await api("/api/admin/summary");sessionStorage.setItem("hssc_admin_key",key);$("status").textContent="Connected securely. Dashboard refreshed from server.";$("dash").classList.remove("hide");$("stats").innerHTML=[["Total mocks",s.exams],["Published",s.published],["Students",s.students],["Attempts",s.attempts]].map(([a,b])=>`<div class="stat">${a}<b>${b}</b></div>`).join("");await loadMocks();}catch(e){sessionStorage.removeItem("hssc_admin_key");$("status").textContent=e.message;$("dash").classList.add("hide");}}
function headers(){return {"Content-Type":"application/json","X-Admin-Key":key}}
async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{...headers(),...(opts.headers||{})}});const j=await r.json();if(!r.ok)throw Error(j.error||"Request failed");return j}
$("connect").onclick=()=>{key=$("key").value.trim();connectDashboard()};
$("backup").onclick=async()=>{try{$("backupStatus").textContent="Preparing database backup…";const r=await fetch("/api/admin/backup",{headers:{"X-Admin-Key":key}});if(!r.ok){const j=await r.json().catch(()=>({}));throw Error(j.error||"Backup download failed.");}const blob=await r.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`hssc-civil-je-backup-${new Date().toISOString().slice(0,10)}.sqlite`;a.click();URL.revokeObjectURL(url);$("backupStatus").textContent="Backup download started. Save it somewhere safe.";}catch(e){$("backupStatus").textContent=e.message}};
function parseCSV(text){
 const rows=[];let row=[],field="",quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'&&quoted&&n==='"'){field+='"';i++}else if(c==='"'){quoted=!quoted}else if(c===","&&!quoted){row.push(field);field=""}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&n==="\n")i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field=""}else field+=c}
 row.push(field);if(row.some(x=>x.trim()))rows.push(row);
 const header=rows.shift().map(x=>x.trim().toLowerCase());
 const col=n=>header.indexOf(n);
 const required=["question","option_a","option_b","option_c","option_d","correct_option","explanation"];
 for(const n of required)if(col(n)<0)throw Error("CSV missing column: "+n);
 return rows.map((r,i)=>{const c=r[col("correct_option")].trim().toUpperCase();const correctIndex=["A","B","C","D"].indexOf(c);if(correctIndex<0)throw Error(`Row ${i+2}: correct_option must be A, B, C or D`);return {question:r[col("question")],options:["option_a","option_b","option_c","option_d"].map(n=>r[col(n)]),correctIndex,explanation:r[col("explanation")]||"",marks:col("marks")>=0?Number(r[col("marks")]||1):1}});
}
$("csv").onchange=async e=>{try{const f=e.target.files[0];if(!f)return;questions=parseCSV(await f.text());const requiredCount=Number($("questionCount").value);
if(questions.length!==requiredCount)throw Error(`Found ${questions.length} questions. Exactly ${requiredCount} are required.`);$("preview").textContent=`${questions.length} questions loaded. First question: ${questions[0].question}`;$("create").disabled=false;saveDraft()}catch(err){questions=[];$("preview").textContent=err.message;$("create").disabled=true}};
$("template").onclick=()=>{const count=Number($("questionCount").value);const csv="question,option_a,option_b,option_c,option_d,correct_option,explanation,marks\\n"+Array.from({length:count},(_,i)=>`Question ${i+1},Option A,Option B,Option C,Option D,A,Explanation for question ${i+1},1`).join("\\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`hssc-je-${count}-question-template.csv`;a.click();URL.revokeObjectURL(a.href)};
$("create").onclick=async()=>{try{const requiredCount=Number($("questionCount").value);if(questions.length!==requiredCount)throw Error(`Please import exactly ${requiredCount} questions.`);
const data=await api("/api/admin/exams",{method:"POST",body:JSON.stringify({title:$("title").value,description:$("description").value,durationMinutes:Number($("duration").value),questions})});$("createStatus").textContent=`Draft #${data.examId} created. Review and publish below.`;questions=[];$("csv").value="";$("preview").textContent="No questions imported."; $("create").disabled=true;localStorage.removeItem(DRAFT_KEY);await loadMocks()}catch(e){$("createStatus").textContent=e.message}};
async function loadMocks(){const list=await api("/api/admin/exams");$("mockList").innerHTML=list.map(m=>`<div class="mockrow"><div><b>#${m.id} ${m.title}</b><small>${m.question_count} questions • ${m.duration_minutes} min • ${m.attempts} attempts • ${m.published?"Published":"Draft"}</small></div><div>${m.published?`<button class="light" data-unpub="${m.id}">Unpublish</button>`:`<button data-pub="${m.id}" ${[25,50,100].includes(m.question_count)?"":"disabled"}>Publish</button><button class="light" data-del="${m.id}">Delete</button>`}<button class="light" data-results="${m.id}">Results</button></div></div>`).join("")||"No mocks created yet."; $("resultExam").innerHTML='<option value="">Select a mock</option>'+list.map(m=>`<option value="${m.id}">#${m.id} ${m.title}</option>`).join("");document.querySelectorAll("[data-pub]").forEach(b=>b.onclick=async()=>{try{await api(`/api/admin/exams/${b.dataset.pub}/publish`,{method:"POST"});await loadMocks()}catch(e){alert(e.message)}});document.querySelectorAll("[data-unpub]").forEach(b=>b.onclick=async()=>{try{await api(`/api/admin/exams/${b.dataset.unpub}/unpublish`,{method:"POST"});await loadMocks()}catch(e){alert(e.message)}});document.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this draft permanently? Student attempts/results prevent deletion."))return;try{await api(`/api/admin/exams/${b.dataset.del}`,{method:"DELETE"});await loadMocks()}catch(e){alert(e.message)}});document.querySelectorAll("[data-results]").forEach(b=>b.onclick=()=>{$("resultExam").value=b.dataset.results;loadResults()})}
async function loadResults(){const id=$("resultExam").value;if(!id)return;try{const rows=await api(`/api/admin/exams/${id}/results`);$("results").innerHTML=rows.map((r,i)=>`<div class="resultrow"><b>#${i+1} ${r.first_name} <small>${r.category||"Legacy"} • Attempt ${r.attempt_number||1}</small></b><span>${r.score} marks • C:${r.correct_count} W:${r.incorrect_count} U:${r.unanswered_count} • Time: ${Math.floor((r.time_taken_seconds||0)/60)}m ${(r.time_taken_seconds||0)%60}s</span></div>`).join("")||"No attempts yet."}catch(e){$("results").textContent=e.message}}
$("resultExam").onchange=loadResults;

$("questionCount").onchange=()=>{if($("csv").files.length){$("csv").dispatchEvent(new Event("change"))}};

// Restore unsent form work and reconnect after a page refresh in the same tab.
["title","description","duration","questionCount"].forEach(id=>$(id).addEventListener("input",saveDraft));
$("questionCount").addEventListener("change",saveDraft);
restoreDraft();
const savedAdminKey=sessionStorage.getItem("hssc_admin_key");
if(savedAdminKey){key=savedAdminKey;$("key").value=savedAdminKey;connectDashboard();}
