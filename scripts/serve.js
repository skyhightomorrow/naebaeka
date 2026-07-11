const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.json':'application/json','.css':'text/css','.js':'text/javascript'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const f=path.join(root,p);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end('404');return;} res.writeHead(200,{'Content-Type':types[path.extname(f)]||'text/plain'});res.end(d); });
}).listen(3360,()=>console.log('serving on 3360'));
