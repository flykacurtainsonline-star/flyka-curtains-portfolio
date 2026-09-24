const crypto = require('crypto');

const allowed = new Set(['zebra','roman','track','ripple','roller','venition','pvc','wallpapers','mosquito']);

function json(statusCode, body){
  return {statusCode, headers:{'content-type':'application/json'}, body:JSON.stringify(body)};
}

function cloudConfig(){
  const cloud=process.env.CLOUDINARY_CLOUD_NAME, key=process.env.CLOUDINARY_API_KEY, secret=process.env.CLOUDINARY_API_SECRET;
  if(!cloud||!key||!secret) throw new Error('Cloudinary environment variables are not configured.');
  return {cloud,key,secret};
}

function authOk(event){
  const h=event.headers||{};
  const token=h.authorization||h.Authorization||'';
  return token==='Bearer flyka-admin-session';
}

async function cloudRequest(url, options, cfg){
  const headers=Object.assign({}, options.headers||{}, {Authorization:`Basic ${Buffer.from(`${cfg.key}:${cfg.secret}`).toString('base64')}`});
  const r=await fetch(url,{...options,headers});
  const text=await r.text();
  let data={}; try{data=JSON.parse(text)}catch(_){data={raw:text}};
  if(!r.ok) throw new Error(data.error?.message||data.message||'Cloudinary request failed');
  return data;
}

function formBody(params){
  const p=new URLSearchParams();
  for(const [k,v] of Object.entries(params)){
    if(Array.isArray(v)) v.forEach(x=>p.append(k+'[]',x));
    else if(v!==undefined&&v!==null) p.append(k,String(v));
  }
  return p.toString();
}

exports.handler=async(event)=>{
  if(event.httpMethod!=='POST') return json(405,{ok:false,error:'Method Not Allowed'});
  if(!authOk(event)) return json(401,{ok:false,error:'Unauthorized'});
  try{
    const cfg=cloudConfig();
    const body=JSON.parse(event.body||'{}');
    const action=body.action;
    const publicId=body.public_id;
    if(action==='delete'){
      if(!publicId) return json(400,{ok:false,error:'Missing public_id'});
      const url=`https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloud)}/resources/image/upload`;
      await cloudRequest(url,{method:'DELETE',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:formBody({public_ids:[publicId],invalidate:true})},cfg);
      return json(200,{ok:true});
    }
    if(action==='move'){
      const category=String(body.category||'');
      const group=String(body.group||'General').trim()||'General';
      const tags=Array.isArray(body.tags)?body.tags:[];
      if(!publicId||!allowed.has(category)) return json(400,{ok:false,error:'Invalid photo or category'});
      const clean=group.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'general';
      const oldCategoryTag=tags.find(t=>t.startsWith('flyka_cat_'))||'';
      const oldCover=tags.find(t=>t.startsWith('flyka_cover_'))||'';
      const next=tags.filter(t=>!t.startsWith('flyka_cat_')&&!t.startsWith('flyka_sub_')&&!t.startsWith('flyka_cover_'));
      if(!next.includes('flyka')) next.push('flyka');
      next.push('flyka_cat_'+category,'flyka_sub_'+clean);
      if(oldCover==='flyka_cover_'+category) next.push(oldCover);
      const url=`https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloud)}/resources/image/tags`;
      await cloudRequest(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:formBody({public_ids:[publicId],command:'replace',tag:next.join(',')})},cfg);
      return json(200,{ok:true,category,group});
    }
    if(action==='cover'){
      const category=String(body.category||'');
      const publicIds=Array.isArray(body.category_public_ids)?body.category_public_ids.filter(Boolean):[];
      if(!publicId||!allowed.has(category)) return json(400,{ok:false,error:'Invalid photo or category'});
      const url=`https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloud)}/resources/image/tags`;
      if(publicIds.length){
        await cloudRequest(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:formBody({public_ids:publicIds,command:'remove',tag:'flyka_cover_'+category})},cfg);
      }
      await cloudRequest(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:formBody({public_ids:[publicId],command:'add',tag:'flyka_cover_'+category})},cfg);
      return json(200,{ok:true});
    }
    return json(400,{ok:false,error:'Unknown action'});
  }catch(e){ return json(500,{ok:false,error:e.message}); }
};
