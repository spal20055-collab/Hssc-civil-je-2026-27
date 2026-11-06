require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const db = new Database(process.env.DB_PATH || "hssc-civil-je.db");
const PORT = process.env.PORT || 3000;
db.pragma("journal_mode = WAL");
app.use(express.json({limit:"3mb"}));
app.use(express.static(path.join(__dirname,"public")));

// Base tables. Existing student, exam and question records are retained.
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
`);

// Migrate the old one-attempt table without deleting submitted attempts/results.
const attemptTable = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='attempts'").get();
if (!attemptTable) {
 db.exec(`CREATE TABLE attempts(
  id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER NOT NULL, telegram_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1, category TEXT, answers TEXT NOT NULL DEFAULT '{}',
  marked_for_review TEXT NOT NULL DEFAULT '[]', score REAL DEFAULT 0,
  correct_count INTEGER DEFAULT 0, incorrect_count INTEGER DEFAULT 0, unanswered_count INTEGER DEFAULT 0,
  started_at TEXT, submitted_at TEXT, time_taken_seconds INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  FOREIGN KEY(exam_id) REFERENCES exams(id)
 )`);
} else if (/UNIQUE\s*\(\s*exam_id\s*,\s*telegram_id\s*\)/i.test(attemptTable.sql || "")) {
 db.transaction(() => {
  db.exec("ALTER TABLE attempts RENAME TO attempts_legacy");
  db.exec(`CREATE TABLE attempts(
   id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER NOT NULL, telegram_id TEXT NOT NULL,
   attempt_number INTEGER NOT NULL DEFAULT 1, category TEXT, answers TEXT NOT NULL DEFAULT '{}',
   marked_for_review TEXT NOT NULL DEFAULT '[]', score REAL DEFAULT 0,
   correct_count INTEGER DEFAULT 0, incorrect_count INTEGER DEFAULT 0, unanswered_count INTEGER DEFAULT 0,
   started_at TEXT, submitted_at TEXT, time_taken_seconds INTEGER DEFAULT 0,
   status TEXT NOT NULL DEFAULT 'submitted',
   FOREIGN KEY(exam_id) REFERENCES exams(id)
  )`);
  db.exec(`INSERT INTO attempts(id,exam_id,telegram_id,attempt_number,answers,score,correct_count,incorrect_count,unanswered_count,submitted_at,time_taken_seconds,status)
   SELECT id,exam_id,telegram_id,1,answers,score,correct_count,incorrect_count,unanswered_count,submitted_at,0,'submitted' FROM attempts_legacy`);
  db.exec("DROP TABLE attempts_legacy");
 })();
} else {
 const cols = new Set(db.prepare("PRAGMA table_info(attempts)").all().map(x=>x.name));
 const additions = {
  attempt_number:"INTEGER NOT NULL DEFAULT 1", category:"TEXT", marked_for_review:"TEXT NOT NULL DEFAULT '[]'",
  started_at:"TEXT", time_taken_seconds:"INTEGER DEFAULT 0", status:"TEXT NOT NULL DEFAULT 'submitted'"
 };
 for (const [name, type] of Object.entries(additions)) if (!cols.has(name)) db.exec(`ALTER TABLE attempts ADD COLUMN ${name} ${type}`);
}
db.exec("CREATE INDEX IF NOT EXISTS idx_attempts_student_exam ON attempts(exam_id,telegram_id,attempt_number)");

const CATEGORIES = ["GEN","EWS","BCA","BCB","OSC","DSC"];
const isoNow = () => new Date().toISOString();
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
  const r=await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getChatMember`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:process.env.TELEGRAM_CHANNEL_ID,user_id:Number(id)})});
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
function adminAuth(req,res,next){if(!process.env.ADMIN_KEY || req.headers["x-admin-key"]!==process.env.ADMIN_KEY)return res.status(401).json({error:"Admin key invalid."});next()}
function cleanQuestion(q){
 if(!q.question || !Array.isArray(q.options)||q.options.length!==4 || !Number.isInteger(Number(q.correctIndex))||Number(q.correctIndex)<0||Number(q.correctIndex)>3)throw new Error("Each question needs question text, exactly 4 options and correctIndex 0–3.");
 const marks=Number(q.marks||1);if(!Number.isFinite(marks)||marks<=0)throw new Error("Question marks must be greater than zero.");
 return {question:String(q.question).trim(),options:JSON.stringify(q.options.map(String)),correctIndex:Number(q.correctIndex),explanation:String(q.explanation||""),marks};
}
const insertQ=db.prepare(`INSERT INTO questions(exam_id,question,options,correct_index,explanation,marks) VALUES(?,?,?,?,?,?)`);
const getStudentAttempts=db.prepare("SELECT * FROM attempts WHERE exam_id=? AND telegram_id=? ORDER BY attempt_number DESC");
const getActive=db.prepare("SELECT * FROM attempts WHERE exam_id=? AND telegram_id=? AND status='active' ORDER BY attempt_number DESC LIMIT 1");

app.get("/api/health",(req,res)=>res.json({ok:true,brand:"HSSC CIVIL JE 2026-27",version:3}));
app.get("/api/me",studentAuth,(req,res)=>res.json({id:String(req.student.id),firstName:req.student.first_name}));
app.get("/api/exams",studentAuth,(req,res)=>res.json(db.prepare(`SELECT id,title,description,duration_minutes,total_marks FROM exams WHERE published=1 ORDER BY id DESC`).all()));
app.get("/api/exams/:id",studentAuth,(req,res)=>{
 const exam=db.prepare("SELECT id,title,description,duration_minutes,total_marks FROM exams WHERE id=? AND published=1").get(req.params.id);
 if(!exam)return res.status(404).json({error:"Mock not found"});
 const attempts=getStudentAttempts.all(exam.id,String(req.student.id));
 const active=getActive.get(exam.id,String(req.student.id));
 const qs=db.prepare("SELECT id,question,options,marks FROM questions WHERE exam_id=? ORDER BY id").all(exam.id).map(q=>({...q,options:JSON.parse(q.options)}));
 res.json({exam,questions:qs,attemptsUsed:attempts.filter(a=>a.status==='submitted').length,attemptsRemaining:Math.max(0,2-attempts.filter(a=>a.status==='submitted').length),activeAttempt:active?{id:active.id,category:active.category,startedAt:active.started_at,answers:JSON.parse(active.answers||'{}'),markedForReview:JSON.parse(active.marked_for_review||'[]')}:null});
});
app.post("/api/exams/:id/start",studentAuth,(req,res)=>{
 const exam=db.prepare("SELECT * FROM exams WHERE id=? AND published=1").get(req.params.id);if(!exam)return res.status(404).json({error:"Mock not found"});
 const category=String(req.body.category||"").toUpperCase();if(!CATEGORIES.includes(category))return res.status(400).json({error:"Please select exactly one valid category."});
 const sid=String(req.student.id);let active=getActive.get(exam.id,sid);if(active)return res.json({attemptId:active.id,startedAt:active.started_at,answers:JSON.parse(active.answers||'{}'),markedForReview:JSON.parse(active.marked_for_review||'[]'),category:active.category,resumed:true});
 const used=getStudentAttempts.all(exam.id,sid).filter(a=>a.status==='submitted').length;if(used>=2)return res.status(403).json({error:"You have used both attempts for this mock."});
 const started=isoNow();const info=db.prepare("INSERT INTO attempts(exam_id,telegram_id,attempt_number,category,answers,marked_for_review,started_at,status) VALUES(?,?,?,?,?,?,?,'active')").run(exam.id,sid,used+1,category,"{}","[]",started);
 res.json({attemptId:Number(info.lastInsertRowid),startedAt:started,answers:{},markedForReview:[],category,resumed:false});
});
app.patch("/api/attempts/:attemptId/answers",studentAuth,(req,res)=>{
 const a=db.prepare("SELECT * FROM attempts WHERE id=? AND telegram_id=? AND status='active'").get(req.params.attemptId,String(req.student.id));if(!a)return res.status(404).json({error:"Active attempt not found."});
 const answers=req.body.answers;if(!answers||typeof answers!=="object"||Array.isArray(answers))return res.status(400).json({error:"Invalid answers."});
 const exam=db.prepare("SELECT duration_minutes FROM exams WHERE id=?").get(a.exam_id);
 if(Date.now()-new Date(a.started_at).getTime()>=exam.duration_minutes*60000)return res.status(400).json({error:"Time has expired. The mock must be submitted."});
 const marks=Array.isArray(req.body.markedForReview)?req.body.markedForReview:[];
 db.prepare("UPDATE attempts SET answers=?,marked_for_review=? WHERE id=?").run(JSON.stringify(answers),JSON.stringify(marks),a.id);res.json({saved:true});
});
app.post("/api/attempts/:attemptId/submit",studentAuth,(req,res)=>{
 const a=db.prepare("SELECT * FROM attempts WHERE id=? AND telegram_id=? AND status='active'").get(req.params.attemptId,String(req.student.id));if(!a)return res.status(404).json({error:"Active attempt not found or already submitted."});
 const exam=db.prepare("SELECT * FROM exams WHERE id=?").get(a.exam_id);const qs=db.prepare("SELECT * FROM questions WHERE exam_id=? ORDER BY id").all(a.exam_id);const answers=JSON.parse(a.answers||'{}');
 const elapsed=Math.max(0,Math.floor((Date.now()-new Date(a.started_at).getTime())/1000));const limit=exam.duration_minutes*60;
 let correct=0,incorrect=0,unanswered=0,score=0;
 for(const q of qs){const val=answers[String(q.id)];if(val===undefined||val===null)unanswered++;else if(Number(val)===q.correct_index){correct++;score+=q.marks}else incorrect++;}
 const taken=Math.min(elapsed,limit);
 db.prepare(`UPDATE attempts SET score=?,correct_count=?,incorrect_count=?,unanswered_count=?,submitted_at=?,time_taken_seconds=?,status='submitted' WHERE id=?`).run(score,correct,incorrect,unanswered,isoNow(),taken,a.id);
 res.json({attemptId:a.id,score,totalMarks:exam.total_marks,correct,incorrect,unanswered,timeTakenSeconds:taken,category:a.category});
});
app.get("/api/exams/:id/result",studentAuth,(req,res)=>{
 const sid=String(req.student.id),attemptId=Number(req.query.attemptId||0);
 const a=attemptId?db.prepare("SELECT * FROM attempts WHERE id=? AND exam_id=? AND telegram_id=? AND status='submitted'").get(attemptId,req.params.id,sid):db.prepare("SELECT * FROM attempts WHERE exam_id=? AND telegram_id=? AND status='submitted' ORDER BY attempt_number DESC LIMIT 1").get(req.params.id,sid);
 if(!a)return res.status(404).json({error:"Result not found"});
 const rank=db.prepare(`SELECT COUNT(*)+1 rank FROM attempts WHERE exam_id=? AND status='submitted' AND (score>? OR (score=? AND submitted_at<?))`).get(req.params.id,a.score,a.score,a.submitted_at).rank;
 const total=db.prepare("SELECT COUNT(*) n FROM questions WHERE exam_id=?").get(req.params.id).n;
 res.json({attemptId:a.id,attemptNumber:a.attempt_number,category:a.category,score:a.score,totalMarks:db.prepare("SELECT total_marks FROM exams WHERE id=?").get(req.params.id).total_marks,correct:a.correct_count,incorrect:a.incorrect_count,unanswered:a.unanswered_count,totalQuestions:total,accuracy:total?Math.round(a.correct_count/total*1000)/10:0,rank,timeTakenSeconds:a.time_taken_seconds,timeRemainingSeconds:Math.max(0,db.prepare("SELECT duration_minutes FROM exams WHERE id=?").get(req.params.id).duration_minutes*60-a.time_taken_seconds),submittedAt:a.submitted_at,attemptsUsed:db.prepare("SELECT COUNT(*) n FROM attempts WHERE exam_id=? AND telegram_id=? AND status='submitted'").get(req.params.id,sid).n});
});
app.get("/api/attempts/:attemptId/review",studentAuth,(req,res)=>{
 const a=db.prepare("SELECT * FROM attempts WHERE id=? AND telegram_id=? AND status='submitted'").get(req.params.attemptId,String(req.student.id));if(!a)return res.status(404).json({error:"Submitted attempt not found."});
 const qs=db.prepare("SELECT id,question,options,correct_index,explanation,marks FROM questions WHERE exam_id=? ORDER BY id").all(a.exam_id).map(q=>{const selected=JSON.parse(a.answers||'{}')[String(q.id)];return {...q,options:JSON.parse(q.options),selectedAnswer:selected===undefined?null:Number(selected),correct:selected!==undefined&&Number(selected)===q.correct_index,status:selected===undefined?"Unattempted":Number(selected)===q.correct_index?"Correct":"Incorrect"}});
 res.json({attemptId:a.id,attemptNumber:a.attempt_number,category:a.category,questions:qs});
});
app.get("/api/exams/:id/leaderboard",studentAuth,(req,res)=>{
 const rows=db.prepare(`SELECT a.score,a.correct_count,a.incorrect_count,a.unanswered_count,a.time_taken_seconds,a.category,s.first_name,a.submitted_at FROM attempts a JOIN students s ON s.telegram_id=a.telegram_id WHERE a.exam_id=? AND a.status='submitted' ORDER BY a.score DESC,a.submitted_at ASC LIMIT 100`).all(req.params.id);
 res.json(rows.map((r,i)=>({...r,rank:i+1})));
});

// Admin APIs
app.get("/api/admin/summary",adminAuth,(req,res)=>res.json({exams:db.prepare("SELECT COUNT(*) n FROM exams").get().n,published:db.prepare("SELECT COUNT(*) n FROM exams WHERE published=1").get().n,students:db.prepare("SELECT COUNT(*) n FROM students").get().n,attempts:db.prepare("SELECT COUNT(*) n FROM attempts WHERE status='submitted'").get().n}));
app.get("/api/admin/exams",adminAuth,(req,res)=>res.json(db.prepare(`SELECT e.*,COUNT(DISTINCT q.id) question_count,COUNT(DISTINCT CASE WHEN a.status='submitted' THEN a.id END) attempts FROM exams e LEFT JOIN questions q ON q.exam_id=e.id LEFT JOIN attempts a ON a.exam_id=e.id GROUP BY e.id ORDER BY e.id DESC`).all()));
app.post("/api/admin/exams",adminAuth,(req,res)=>{
 try{const {title,description="",durationMinutes=90,questions=[]}=req.body;const allowedCounts=[25,50,100],allowedDurations=[25,50,90];if(!title||!Array.isArray(questions)||!allowedCounts.includes(questions.length))throw new Error("A mock must contain exactly 25, 50 or 100 questions.");if(!allowedDurations.includes(Number(durationMinutes)))throw new Error("Duration must be 25, 50 or 90 minutes.");
 const create=db.transaction(()=>{const total=questions.reduce((s,q)=>s+cleanQuestion(q).marks,0);const info=db.prepare("INSERT INTO exams(title,description,duration_minutes,total_marks,published) VALUES(?,?,?,?,0)").run(title,description,Number(durationMinutes),total);for(const raw of questions){const q=cleanQuestion(raw);insertQ.run(info.lastInsertRowid,q.question,q.options,q.correctIndex,q.explanation,q.marks)}return Number(info.lastInsertRowid)});res.json({examId:create(),message:"Draft created. Review and publish when ready."})}catch(e){res.status(400).json({error:e.message})}
});
app.post("/api/admin/exams/:id/publish",adminAuth,(req,res)=>{const count=db.prepare("SELECT COUNT(*) n FROM questions WHERE exam_id=?").get(req.params.id).n;if(![25,50,100].includes(count))return res.status(400).json({error:"Only 25, 50 or 100-question mocks can be published."});const r=db.prepare("UPDATE exams SET published=1 WHERE id=?").run(req.params.id);res.json({published:r.changes>0})});
app.post("/api/admin/exams/:id/unpublish",adminAuth,(req,res)=>{const r=db.prepare("UPDATE exams SET published=0 WHERE id=?").run(req.params.id);res.json({published:false,updated:r.changes>0})});
app.delete("/api/admin/exams/:id",adminAuth,(req,res)=>{const exam=db.prepare("SELECT id,published FROM exams WHERE id=?").get(req.params.id);if(!exam)return res.status(404).json({error:"Mock not found."});if(exam.published)return res.status(400).json({error:"Unpublish this mock before deleting it."});const attempts=db.prepare("SELECT COUNT(*) n FROM attempts WHERE exam_id=?").get(req.params.id).n;if(attempts>0)return res.status(400).json({error:"This mock has student attempts/results and cannot be deleted."});db.transaction(()=>{db.prepare("DELETE FROM questions WHERE exam_id=?").run(req.params.id);db.prepare("DELETE FROM exams WHERE id=?").run(req.params.id)})();res.json({deleted:true})});
app.get("/api/admin/exams/:id/results",adminAuth,(req,res)=>res.json(db.prepare(`SELECT s.first_name,s.username,a.id attempt_id,a.attempt_number,a.category,a.score,a.correct_count,a.incorrect_count,a.unanswered_count,a.time_taken_seconds,a.submitted_at FROM attempts a JOIN students s ON s.telegram_id=a.telegram_id WHERE a.exam_id=? AND a.status='submitted' ORDER BY a.score DESC,a.submitted_at ASC`).all(req.params.id)));
app.listen(PORT,()=>console.log(`HSSC CIVIL JE 2026-27 running on port ${PORT}`));
