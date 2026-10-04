'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
export function BrandedSelect({value,options,onChange,label}:{value:string;options:string[];onChange:(value:string)=>void;label:string}) {
  const [open,setOpen]=useState(false);const [focused,setFocused]=useState(0);
  const root=useRef<HTMLDivElement>(null);const trigger=useRef<HTMLButtonElement>(null);const items=useRef<(HTMLButtonElement|null)[]>([]);const id=useId();
  useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
  useEffect(()=>{if(open)items.current[focused]?.focus();},[open,focused]);
  const show=()=>{setFocused(Math.max(0,options.indexOf(value)));setOpen(true);};
  const close=()=>{setOpen(false);trigger.current?.focus();};
  return <div className="branded-select" ref={root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false);}}><button ref={trigger} type="button" className="branded-select-trigger" role="combobox" aria-label={label} aria-expanded={open} aria-controls={id} aria-haspopup="listbox" onClick={()=>open?close():show()} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();show();}}}>{value}<ChevronDown size={15} className={open?'select-chevron-open':''}/></button>{open&&<div id={id} className="branded-select-menu" role="listbox" aria-label={label} onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();close();}
    else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setFocused(i=>(i+(event.key==='ArrowDown'?1:-1)+options.length)%options.length);}
    else if(event.key==='Home'||event.key==='End'){event.preventDefault();setFocused(event.key==='Home'?0:options.length-1);}
    else if(event.key.length===1&&/^[a-z]$/i.test(event.key)){const index=options.findIndex(option=>option.toLowerCase().startsWith(event.key.toLowerCase()));if(index>=0){event.preventDefault();setFocused(index);}}
  }}><span className="select-menu-label">MATCH RESULTS</span>{options.map((option,index)=><button key={option} ref={element=>{items.current[index]=element;}} type="button" role="option" aria-selected={value===option} tabIndex={index===focused?0:-1} className={`branded-select-option ${value===option?'is-selected':''}`} onClick={()=>{onChange(option);close();}}>{option}{value===option&&<Check size={16}/>}</button>)}</div>}</div>;
}
