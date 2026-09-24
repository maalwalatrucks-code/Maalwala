// Paste-and-review importer for load text copied from WhatsApp.
// Group messages are never scraped or monitored by this script.
(function initWhatsAppLoadImporter(){
  const header=document.querySelector('#screen-loads .screen-header');
  if(!header) return;
  const style=document.createElement('style');
  style.textContent=`#mwImportModal{position:fixed;inset:0;z-index:999;background:#1119;display:flex;align-items:center;justify-content:center;padding:14px}#mwImportModal[hidden]{display:none}#mwImportPanel{background:var(--surface,#fff);color:var(--text,#222);border-radius:16px;padding:22px;width:min(760px,96vw);max-height:90vh;overflow:auto;box-shadow:0 20px 50px #0004}#mwImportPanel label{display:block;margin:10px 0;font-size:.88rem}#mwImportPanel textarea{box-sizing:border-box;width:100%;min-height:150px;resize:vertical;padding:10px;border:1px solid #999;border-radius:8px;background:var(--surface,#fff);color:inherit;font:inherit}#mwImportPanel input[type=text],#mwImportPanel input[type=number]{box-sizing:border-box;max-width:180px;width:100%;padding:7px;border:1px solid #aaa;border-radius:6px;background:var(--surface,#fff);color:inherit}#mwImportPreview{overflow:auto;margin:12px 0}#mwImportPreview table{width:100%;border-collapse:collapse;font-size:.82rem}#mwImportPreview th,#mwImportPreview td{padding:7px;border-bottom:1px solid #ddd;text-align:left}#mwImportPanel .mw-check{display:flex;gap:8px;align-items:flex-start}#mwImportPanel .mw-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-bottom:12px}#mwImportPanel .mw-note{font-size:.8rem;opacity:.8}`;
  document.head.appendChild(style);

  const open=document.createElement('button');
  open.type='button'; open.className='btn btn-ghost'; open.textContent='Import WhatsApp text';
  open.setAttribute('aria-haspopup','dialog');
  header.appendChild(open);

  const modal=document.createElement('div');
  modal.id='mwImportModal'; modal.hidden=true; modal.innerHTML=`<section id="mwImportPanel" role="dialog" aria-modal="true" aria-labelledby="mwImportTitle">
    <div class="modal-head"><h2 id="mwImportTitle">Import load message</h2><button type="button" id="mwImportClose" class="modal-close" aria-label="Close">✕</button></div>
    <p class="mw-note">Paste a message you have permission to share. Keep each route on its own line and its dimensions and truck requirement on the next line. Each route becomes a separate draft. Unknown cargo, rate, and loading date stay unspecified; sender phone numbers are never copied.</p>
    <label>WhatsApp message<textarea id="mwImportText" placeholder="Paste one or more load messages here"></textarea></label>
    <div class="mw-actions"><button type="button" id="mwImportParse" class="btn btn-primary">Split into drafts</button></div>
    <div id="mwImportPreview" aria-live="polite"></div>
    <form id="mwImportForm" hidden>
      <label class="mw-check"><input type="checkbox" id="mwImportFresh" required> I reviewed these drafts and confirm they are accurate, still available, and shared with permission.</label>
      <label class="mw-check"><input type="checkbox" id="mwImportTerms" required> I understand optional escrow is available only for eligible bookings when shown at checkout; otherwise, freight is settled directly between the parties. I will verify identity, RC, and relevant documents before paying any advance.</label>
      <button id="mwImportSubmit" type="submit" class="btn btn-primary btn-lg full">Post selected loads</button>
    </form>
  </section>`;
  document.body.appendChild(modal);

  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function parse(raw){
    const drafts=[]; let pendingRoute='';
    const lines=String(raw||'').replace(/\r/g,'').split('\n').map(line=>line.trim()).filter(Boolean);
    const routeParts=value=>{
      const m=value.replace(/^(?:load|लोड)\s*[:：-]?\s*/i,'').match(/^(.*?)\s+(?:to|से)\s+(.+?)\s*$/i);
      return m?{from:m[1].replace(/[.\s,;:-]+$/g,'').trim(),to:m[2].replace(/[.\s,;:-]+$/g,'').trim()}:null;
    };
    const truckTypeFrom=value=>/3\s*xl|semi/i.test(value)?'Semi trailer':/hbt|high\s*bed|hyva/i.test(value)?'HBT trailer':/trailer|trailor/i.test(value)?'Trailer':'';
    const spec=/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)(?:\s*[x×*]\s*|\s*=\s*)(\d+(?:\.\d+)?)\s*(?:mt|tons?|tonnes?)/ig;
    for(const line of lines){
      spec.lastIndex=0; const matches=[...line.matchAll(spec)];
      if(!matches.length){
        if(routeParts(line)) pendingRoute=line;
        else if(drafts.length){const type=truckTypeFrom(line);if(type)drafts[drafts.length-1].truckType=type;}
        continue;
      }
      for(const m of matches){
        const route=routeParts(line.slice(0,m.index))||routeParts(pendingRoute);
        if(!route) continue;
        const tail=line.slice(m.index+m[0].length).toLowerCase();
        const truckType=truckTypeFrom(tail)||'Not specified';
        drafts.push({...route,weight:Number(m[4]),truckType}); pendingRoute='';
      }
    }
    return drafts;
  }
  open.addEventListener('click',()=>{modal.hidden=false; document.getElementById('mwImportText').focus();});
  document.getElementById('mwImportClose').addEventListener('click',()=>{modal.hidden=true;});
  modal.addEventListener('click',e=>{if(e.target===modal) modal.hidden=true;});
  document.getElementById('mwImportParse').addEventListener('click',()=>{
    const drafts=parse(document.getElementById('mwImportText').value);
    const preview=document.getElementById('mwImportPreview'), form=document.getElementById('mwImportForm');
    document.getElementById('mwImportFresh').checked=false; document.getElementById('mwImportTerms').checked=false;
    if(!drafts.length){preview.textContent='No load drafts found. Put each route on one line and its dimensions, weight, and truck requirement on the next line.';form.hidden=true;return;}
    preview.innerHTML=`<p>${drafts.length} draft(s) found. Review and correct each route before posting.</p><table><thead><tr><th>Post?</th><th>From</th><th>To</th><th>Tonnes</th><th>Truck</th></tr></thead><tbody>${drafts.map((d,i)=>`<tr data-row="${i}"><td><input class="mw-select" type="checkbox" checked aria-label="Select load ${i+1}"></td><td><input data-field="from" type="text" value="${escape(d.from)}"></td><td><input data-field="to" type="text" value="${escape(d.to)}"></td><td><input data-field="weight" type="number" step="0.1" value="${escape(d.weight)}"></td><td><input data-field="truckType" type="text" value="${escape(d.truckType)}"></td></tr>`).join('')}</tbody></table><p class="mw-note">Cargo, rate, loading date, and sender phone were not provided in the listing fields.</p>`;
    form.hidden=false;
  });
  document.getElementById('mwImportForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const rows=[...document.querySelectorAll('#mwImportPreview [data-row]')].filter(row=>row.querySelector('.mw-select').checked);
    if(!rows.length){window.alert('Select at least one load draft.');return;}
    const button=document.getElementById('mwImportSubmit'); button.disabled=true;
    let posted=0;
    try{
      const base=String(window.MAALWALA_API_BASE||'').replace(/\/$/,'');
      if(!base) throw new Error('The live posting API is not configured.');
      for(const row of rows){
        const field=name=>row.querySelector(`[data-field="${name}"]`).value.trim();
        const payload={from:field('from'),to:field('to'),material:'Not specified',weight:field('weight'),truckType:field('truckType')||'Not specified',rate:null,date:null,poster:'Shared WhatsApp listing',phone:'',verified:false};
        if(!payload.from||!payload.to||!payload.weight) throw new Error('Complete the route and weight for each selected draft.');
        const response=await fetch(`${base}/api/loads`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const result=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(result.error||'The server rejected a load.');
        posted++;
      }
      window.location.reload();
    }catch(error){
      window.alert(posted?`${posted} load(s) posted. The rest were not posted: ${error.message}`:error.message||'Could not post these loads.');
      button.disabled=false;
    }
  });
})();
