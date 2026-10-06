import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const PROJECT_ID='f4a131a8-75d5-42d2-927b-9086901c3d57';
export const CHANNEL='challenges';
Notifications.setNotificationHandler({handleNotification:async()=>({
  shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false,
})});

export async function pushToken() {
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync(CHANNEL,{
    name:'Challenge invitations',importance:Notifications.AndroidImportance.HIGH,
    sound:'default',lightColor:'#daf69b',
  });
  const permission=await Notifications.getPermissionsAsync();
  const allowed=permission.status==='granted'||permission.ios?.status===Notifications.IosAuthorizationStatus.PROVISIONAL;
  if(!allowed){
    if(!permission.canAskAgain)return null;
    const requested=await Notifications.requestPermissionsAsync();
    if(requested.status!=='granted'&&requested.ios?.status!==Notifications.IosAuthorizationStatus.PROVISIONAL)return null;
  }
  return (await Notifications.getExpoPushTokenAsync({projectId:PROJECT_ID})).data;
}
