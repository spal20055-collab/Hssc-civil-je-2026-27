require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const db = new Database("hssc-civil-je.db");
const PORT = process.env.PORT || 3000;
app.use(express.json({limit:"3mb"}));
app.use(express.static(path.join(__dirname,"public")));

db.exec(`
CREATE TABLE IF NOT EXISTS students(
 telegram_id TEXT PRIMARY KEY, first_name TEXT, username TEXT,
 joined_channel INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS exams(
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '',
 duration_minutes INTEGER NOT NULL DEFAULT 90, total_marks REAL NOT NULL DEFAULT 50,
 published INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS questions(
 id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER NOT NULL,
 question TEXT NOT NULL, options TEXT NOT NULL, correct_index INTEGER NOT NULL,
 explanation TEXT DEFAULT '', marks REAL DEFAULT 1,
 FOREIGN KEY(exam_id) REFERENCES exams(id)
);
CREATE TABLE IF NOT EXISTS attempts(
 id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER NOT NULL,
 telegram_id TEXT NOT NULL, answers TEXT NOT NULL, score REAL NOT NULL,
 correct_count INTEGER NOT NULL, incorrect_count INTEGER NOT NULL,
 unanswered_count INTEGER NOT NULL, submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(exam_id,telegram_id)
);
`);

function verifyInitData(raw){
 if(!process.env.BOT_TOKEN || !raw) return null;
 const p=new URLSearchParams(raw), hash=p.get("hash"); if(!hash)return null; p.delete("hash");
 const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
 const secret=crypto.createHmac("sha256","WebAppData").update(process.env.BOT_TOKEN).digest();
 const expected=crypto.createHmac("sha256",secret).update(check).digest("hex");
 if(!/^[a-f0-9]{64}$/i.test(hash) || !crypto.timingSafeEqual(Buffer.from(hash,"hex"),Buffer.from(expected,"hex")))return null;
 const ts=Number(p.get("auth_date")||0); if(!ts || Date.now()/1000-ts>86400)return null;
 try{return JSON.parse(p.get("user")||"null")}catch{return null}
}
async function channelMember(id){
 if(!process.env.BOT_TOKEN || !process.env.TELEGRAM_CHANNEL_ID)return false;
 try{
  const r=await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getChatMember`,{
   method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({chat_id:process.env.TELEGRAM_CHANNEL_ID,user_id:Number(id)})
  });
  const j=await r.json();return !!(j.ok && ["creator","administrator","member"].includes(j.result.status));
 }catch{return false}
}
async function studentAuth(req,res,next){
 const u=verifyInitData(req.headers["x-telegram-init-data"]);
 if(!u?.id)return res.status(401).json({error:"Open this site using the Telegram bot Web App button."});
 if(!await channelMember(u.id))return res.status(403).json({error:"Join @Hssc_Civil_je_2026_27 first, then reopen the mock."});
 db.prepare(`INSERT INTO students(telegram_id,first_name,username,joined_channel) VALUES(?,?,?,1)
 ON CONFLICT(telegram_id) DO UPDATE SET first_name=excluded.first_name,username=excluded.username,joined_channel=1`)
 .run(String(u.id),u.first_name||"Student",u.username||"");
 req.student=u;next();
}
function adminAuth(req,res,next){
 if(!process.env.ADMIN_KEY || req.headers["x-admin-key"]!==process.env.ADMIN_KEY)
  return res.status(401).json({error:"Admin key invalid."});
 next();
}
function cleanQuestion(q){
 if(!q.question || !Array.isArray(q.options)||q.options.length!==4 ||
 !Number.isInteger(Number(q.correctIndex))||Number(q.correctIndex)<0||Number(q.correctIndex)>3)
 throw new Error("Each question needs question text, exactly 4 options and correctIndex 0–3.");
 return {question:String(q.question).trim(),options:JSON.stringify(q.options.map(String)),
 correctIndex:Number(q.correctIndex),explanation:String(q.explanation||""),marks:Number(q.marks||1)};
}
const insertQ=db.prepare(`INSERT INTO questions(exam_id,question,options,correct_index,explanation,marks) VALUES(?,?,?,?,?,?)`);

app.get("/api/health",(req,res)=>res.json({ok:true,brand:"HSSC CIVIL JE 2026-27",version:2}));
app.get("/api/me",studentAuth,(req,res)=>res.json({id:String(req.student.id),firstName:req.student.first_name}));
app.get("/api/exams",studentAuth,(req,res)=>res.json(db.prepare(`SELECT id,title,description,duration_minutes,total_marks FROM exams WHERE published=1 ORDER BY id DESC`).all()));
app.get("/api/exams/:id",studentAuth,(req,res)=>{
 const exam=db.prepare("SELECT id,title,description,duration_minutes,total_marks FROM exams WHERE id=? AND published=1").get(req.params.id);
 if(!exam)return res.status(404).json({error:"Mock not found"});
 const done=db.prepare("SELECT id FROM attempts WHERE exam_id=? AND telegram_id=?").get(exam.id,String(req.student.id));
 if(done)return res.status(409).json({error:"You have already submitted this mock."});
 const qs=db.prepare("SELECT id,question,options,marks FROM questions WHERE exam_id=? ORDER BY id").all(exam.id).map(q=>({...q,options:JSON.parse(q.options)}));
 res.json({exam,questions:qs});
});
app.post("/api/exams/:id/submit",studentAuth,(req,res)=>{
 const exam=db.prepare("SELECT * FROM exams WHERE id=? AND published=1").get(req.params.id);
 if(!exam)return res.status(404).json({error:"Mock not found"});
 const sid=String(req.student.id);
 if(db.prepare("SELECT id FROM attempts WHERE exam_id=? AND telegram_id=?").get(exam.id,sid))return res.status(409).json({error:"Already submitted."});
 const qs=db.prepare("SELECT * FROM questions WHERE exam_id=?").all(exam.id), answers=req.body.answers||{};
 let correct=0,incorrect=0,unanswered=0,score=0;
 for(const q of qs){const a=answers[String(q.id)];if(a===undefined||a===null)unanswered++;else if(Number(a)===q.correct_index){correct++;score+=q.marks}else incorrect++;}
 db.prepare(`INSERT INTO attempts(exam_id,telegram_id,answers,score,correct_count,incorrect_count,unanswered_count) VALUES(?,?,?,?,?,?,?)`)
 .run(exam.id,sid,JSON.stringify(answers),score,correct,incorrect,unanswered);
 res.json({score,totalMarks:exam.total_marks,correct,incorrect,unanswered});
});
app.get("/api/exams/:id/result",studentAuth,(req,res)=>{
 const a=db.prepare("SELECT * FROM attempts WHERE exam_id=? AND telegram_id=?").get(req.params.id,String(req.student.id));
 if(!a)return res.status(404).json({error:"Result not found"});
 const rank=db.prepare(`SELECT COUNT(*)+1 rank FROM attempts WHERE exam_id=? AND (score>? OR (score=? AND submitted_at<?))`)
 .get(req.params.id,a.score,a.score,a.submitted_at).rank;
 res.json({score:a.score,correct:a.correct_count,incorrect:a.incorrect_count,unanswered:a.unanswered_count,rank});
});
app.get("/api/exams/:id/leaderboard",studentAuth,(req,res)=>{
 const rows=db.prepare(`SELECT a.score,a.correct_count,a.incorrect_count,a.unanswered_count,s.first_name,a.submitted_at
 FROM attempts a JOIN students s ON s.telegram_id=a.telegram_id WHERE a.exam_id=?
 ORDER BY a.score DESC,a.submitted_at ASC LIMIT 100`).all(req.params.id);
 res.json(rows.map((r,i)=>({...r,rank:i+1})));
});

// Admin dashboard APIs. Keep ADMIN_KEY secret; never put it in public student code.
app.get("/api/admin/summary",adminAuth,(req,res)=>res.json({
 exams:db.prepare("SELECT COUNT(*) n FROM exams").get().n,
 published:db.prepare("SELECT COUNT(*) n FROM exams WHERE published=1").get().n,
 students:db.prepare("SELECT COUNT(*) n FROM students").get().n,
 attempts:db.prepare("SELECT COUNT(*) n FROM attempts").get().n
}));
app.get("/api/admin/exams",adminAuth,(req,res)=>res.json(db.prepare(`SELECT e.*,COUNT(DISTINCT q.id) question_count,COUNT(DISTINCT a.id) attempts
 FROM exams e LEFT JOIN questions q ON q.exam_id=e.id LEFT JOIN attempts a ON a.exam_id=e.id
 GROUP BY e.id ORDER BY e.id DESC`).all()));
app.post("/api/admin/exams",adminAuth,(req,res)=>{
 try{
  const {title,description="",durationMinutes=90,questions=[]}=req.body;
  const allowedCounts=[25,50,100], allowedDurations=[25,50,90];
  if(!title||!Array.isArray(questions)||!allowedCounts.includes(questions.length))throw new Error("A mock must contain exactly 25, 50 or 100 questions.");
  if(!allowedDurations.includes(Number(durationMinutes)))throw new Error("Duration must be 25, 50 or 90 minutes.");
  const total=questions.reduce((s,q)=>s+Number(q.marks||1),0);
  const create=db.transaction(()=>{
   const info=db.prepare("INSERT INTO exams(title,description,duration_minutes,total_marks,published) VALUES(?,?,?,?,0)")
    .run(title,description,Number(durationMinutes),total);
   for(const raw of questions){const q=cleanQuestion(raw);insertQ.run(info.lastInsertRowid,q.question,q.options,q.correctIndex,q.explanation,q.marks);}
   return Number(info.lastInsertRowid);
  });
  res.json({examId:create(),message:"Draft created. Review and publish when ready."});
 }catch(e){res.status(400).json({error:e.message});}
});
app.post("/api/admin/exams/:id/publish",adminAuth,(req,res)=>{
 const count=db.prepare("SELECT COUNT(*) n FROM questions WHERE exam_id=?").get(req.params.id).n;
 if(![25,50,100].includes(count))return res.status(400).json({error:"Only 25, 50 or 100-question mocks can be published."});
 const r=db.prepare("UPDATE exams SET published=1 WHERE id=?").run(req.params.id);
 res.json({published:r.changes>0});
});
app.post("/api/admin/exams/:id/unpublish",adminAuth,(req,res)=>{
 const r=db.prepare("UPDATE exams SET published=0 WHERE id=?").run(req.params.id);res.json({published:false,updated:r.changes>0});
});
app.delete("/api/admin/exams/:id",adminAuth,(req,res)=>{
 const exam=db.prepare("SELECT id,published FROM exams WHERE id=?").get(req.params.id);
 if(!exam)return res.status(404).json({error:"Mock not found."});
 if(exam.published)return res.status(400).json({error:"Unpublish this mock before deleting it."});
 const attempts=db.prepare("SELECT COUNT(*) n FROM attempts WHERE exam_id=?").get(req.params.id).n;
 if(attempts>0)return res.status(400).json({error:"This mock has student attempts/results and cannot be deleted."});
 const remove=db.transaction(()=>{
  db.prepare("DELETE FROM questions WHERE exam_id=?").run(req.params.id);
  db.prepare("DELETE FROM exams WHERE id=?").run(req.params.id);
 });
 remove();
 res.json({deleted:true});
});
app.get("/api/admin/exams/:id/results",adminAuth,(req,res)=>res.json(db.prepare(`SELECT s.first_name,s.username,a.score,a.correct_count,a.incorrect_count,a.unanswered_count,a.submitted_at
 FROM attempts a JOIN students s ON s.telegram_id=a.telegram_id WHERE a.exam_id=?
 ORDER BY a.score DESC,a.submitted_at ASC`).all(req.params.id)));
app.listen(PORT,()=>console.log(`HSSC CIVIL JE 2026-27 running on port ${PORT}`));
