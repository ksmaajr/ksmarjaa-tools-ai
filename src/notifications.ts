import './notifications.css';
import {subscribeActivity,type ActivityEntry,type Level} from './activity';
const glyphs:Record<Level,string>={success:'circle-check',error:'circle-x',warning:'triangle-alert',info:'info'};
export function mountNotifications(options:{icons:()=>void;openActivity:()=>void}){
  document.querySelector('#toast')?.remove();
  const region=document.createElement('div');region.id='notifications';region.setAttribute('aria-label','Notifikasi aplikasi');region.setAttribute('role','region');document.body.append(region);
  const remove=(toast:HTMLElement)=>{toast.classList.add('leaving');setTimeout(()=>toast.remove(),180);};
  const show=(entry:ActivityEntry)=>{
    const key=`${entry.level}:${entry.category}:${entry.title}:${entry.message}`;
    for(const existing of region.querySelectorAll<HTMLElement>('.floating-notice'))if(existing.dataset.noticeKey===key)existing.remove();
    while(region.children.length>=3)region.firstElementChild?.remove();
    const toast=document.createElement('div');toast.className=`floating-notice notice-${entry.level}`;toast.setAttribute('role',entry.level==='error'?'alert':'status');
    toast.dataset.noticeKey=key;
    toast.innerHTML=`<div class="notice-icon"><i data-lucide="${glyphs[entry.level]}" aria-hidden="true"></i></div><div class="notice-content"><strong></strong><p></p><button class="notice-log" type="button">Lihat aktivitas <span aria-hidden="true">↗</span></button></div><button class="notice-close" type="button" aria-label="Tutup notifikasi"><i data-lucide="x" aria-hidden="true"></i></button><div class="notice-timer" aria-hidden="true"></div>`;
    toast.querySelector('strong')!.textContent=entry.title;toast.querySelector('p')!.textContent=entry.message;region.append(toast);options.icons();
    if(entry.transient)toast.querySelector<HTMLButtonElement>('.notice-log')!.hidden=true;
    const lifetime=entry.level==='error'?9000:entry.level==='warning'?7000:5000;let remaining=lifetime;let started=performance.now();let timer=window.setTimeout(()=>remove(toast),remaining);
    const progress=toast.querySelector<HTMLElement>('.notice-timer')!;progress.style.animationDuration=`${lifetime}ms`;
    toast.onmouseenter=()=>{clearTimeout(timer);remaining-=performance.now()-started;progress.style.animationPlayState='paused';};
    toast.onmouseleave=()=>{started=performance.now();timer=window.setTimeout(()=>remove(toast),Math.max(remaining,100));progress.style.animationPlayState='running';};
    toast.querySelector('.notice-close')!.addEventListener('click',()=>{clearTimeout(timer);remove(toast);});
    toast.querySelector('.notice-log')!.addEventListener('click',()=>{options.openActivity();clearTimeout(timer);remove(toast);});
  };
  subscribeActivity((entry,notify)=>{if(entry&&notify)show(entry);});return {show};
}
