const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.json':'application/json','.css':'text/css','.js':'text/javascript'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p.endsWith('/'))p+='index.html';
  const f=path.join(root,p);
  fs.readFile(f,(e,d)=>{
    if(e){
      // 확장자 없는 경로는 .html로 폴백 (Cloudflare Pages clean URL 동작 재현)
      if(!path.extname(f)) return fs.readFile(f+'.html',(e2,d2)=>{
        if(e2){res.writeHead(404);res.end('404');return;}
        res.writeHead(200,{'Content-Type':types['.html']});res.end(d2);
      });
      res.writeHead(404);res.end('404');return;
    }
    res.writeHead(200,{'Content-Type':types[path.extname(f)]||'text/plain'});res.end(d);
  });
}).listen(3360,()=>console.log('serving on 3360'));
