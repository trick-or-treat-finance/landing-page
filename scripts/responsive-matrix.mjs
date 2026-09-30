import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright-core";
const dist = resolve("dist"), out = process.argv[2]; mkdirSync(out,{recursive:true});
const T={".html":"text/html",".css":"text/css",".js":"text/javascript",".png":"image/png",".jpg":"image/jpeg",".woff2":"font/woff2",".svg":"image/svg+xml"};
const server=createServer((q,r)=>{const f=join(dist,q.url.split(/[?#]/)[0].replace("/landing-page","").replace(/\/$/,"/index.html"));if(!f.startsWith(dist)||!existsSync(f))return r.writeHead(404).end();r.writeHead(200,{"content-type":T[extname(f)]??"application/octet-stream"}).end(readFileSync(f));});
await new Promise(o=>server.listen(0,"127.0.0.1",o));
const base=`http://127.0.0.1:${server.address().port}/landing-page/index.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
const sizes=JSON.parse(process.argv[3]); const shots=process.argv[4]!=="noshots";
for(const [w,h] of sizes) for(const theme of ["light","dark"]) for(const view of ["trick","treat"]){
  const p=await browser.newPage({viewport:{width:w,height:h}});
  await p.goto(base,{waitUntil:"networkidle"});
  await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  if(view==="treat") await p.click("#sw");
  await p.waitForTimeout(+(process.env.WAIT||700));
  const r=await p.evaluate(()=>{
    const de=document.documentElement;
    const sm=[...document.querySelectorAll("a,button,input,[role=switch],[role=button]")].filter(e=>{const b=e.getBoundingClientRect();const cs=getComputedStyle(e);return b.width>0&&b.height>0&&cs.visibility!=="hidden"&&(b.height<43.5||b.width<43.5)&&!e.closest(".sr")}).map(e=>`${e.tagName}.${e.className||e.id}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
    const wide=[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=="fixed").slice(0,4).map(e=>e.tagName+"."+e.className);
    const rc=document.querySelector(".rc")?.getBoundingClientRect(), st=document.querySelector(".stamp")?.getBoundingClientRect();
    const lines=[...document.querySelectorAll(".lines li")].filter(l=>l.getBoundingClientRect().height>0);
    return {sw:de.scrollWidth,iw:innerWidth,wide,small:sm.slice(0,8),nSmall:sm.length,
      stamp:st&&st.width?{inside:st.left>=rc.left-1&&st.right<=rc.right+1,w:Math.round(st.width)}:null,
      visLines:lines.length,emptyLines:lines.filter(l=>!l.textContent.trim()).length,
      tot:document.querySelector(".tot-l")?.innerText.replace(/\n/g," / ")};
  });
  const tag=`${w}x${h}-${view}-${theme}`;
  console.log(tag, r.sw<=r.iw?"OK":"HSCROLL", JSON.stringify(r));
  if(shots){ await p.evaluate(()=>scrollTo(0,0)); await p.screenshot({path:join(out,`${tag}-top.png`)});
    if(view==="treat"){ const rc=await p.$(".rc"); await rc.scrollIntoViewIfNeeded(); await rc.screenshot({path:join(out,`${tag}-receipt.png`)}); } }
  await p.close();
}
await browser.close(); server.close();
