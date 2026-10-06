'use client';
import { useEffect, useRef } from 'react';
import { beginPushSession,detachPushToken,nativeMessage,registerPushToken } from '@/lib/mobile-push';
import { useNotification } from '@/components/notifications';
import { supabase } from '@/lib/backend';
import type { Player } from '@/lib/game';

export function useMobilePush(user:Player|null,refresh:()=>Promise<void>,onOpen:()=>void) {
  const notify=useNotification();
  const currentUser=useRef(user?.id);currentUser.current=user?.id;
  const open=useRef(onOpen);open.current=onOpen;
  useEffect(()=>{
    if(!user||!supabase)return;
    beginPushSession();
    let active=true;
    let warned=false;
    const receive=(event:Event)=>{
      const detail=(event as CustomEvent).detail;
      if(!active||currentUser.current!==user.id)return;
      if(detail?.type==='token'&&detail.userId===user.id&&typeof detail.token==='string'){
        void registerPushToken(detail.token).catch(error=>notify(error.message,'error'));
      }else if(detail?.type==='disabled'&&detail.userId===user.id){
        void detachPushToken(false).catch(error=>notify(error.message,'error'));
      }else if(detail?.type==='error'&&detail.userId===user.id&&!warned){
        warned=true;
        notify('Challenge alerts are unavailable. Check notification permission in your phone settings.','info');
      }else if(detail?.type==='open'){open.current();void refresh();}
    };
    window.addEventListener('qalim-native-push',receive);
    const request=()=>nativeMessage({type:'qalim-push-register',userId:user.id});
    request();
    window.addEventListener('online',request);
    return()=>{active=false;window.removeEventListener('qalim-native-push',receive);window.removeEventListener('online',request);};
  },[user,refresh,notify]);
}
