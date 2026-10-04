'use client';
import { useId, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {label?: string};
export function PasswordField({label='Password',id,...props}: Props) {
  const generatedId=useId();
  const inputId=id || generatedId;
  const [visible,setVisible]=useState(false);
  return <label htmlFor={inputId}>{label}<span className="password-field">
    <input {...props} id={inputId} type={visible?'text':'password'}/>
    <button type="button" className="password-toggle" aria-label={`${visible?'Hide':'Show'} ${label.toLowerCase()}`} aria-pressed={visible} disabled={props.disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>setVisible(value=>!value)}>
      {visible?<EyeOff size={19} aria-hidden="true"/>:<Eye size={19} aria-hidden="true"/>}
    </button>
  </span></label>;
}
