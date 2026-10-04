import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const GAME_URL = 'https://qalim-ticktack.vercel.app/';

export default function App() {
  const webView = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack || failed) return false;
      webView.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack, failed]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        {failed ? (
          <View style={styles.message}>
            <Text style={styles.title}>Let’s reconnect.</Text>
            <Text style={styles.detail}>Check your internet connection and try again.</Text>
            <Pressable style={styles.button} onPress={() => { setCanGoBack(false); setFailed(false); setAttempt(value => value + 1); }}>
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            key={attempt}
            ref={webView}
            source={{ uri: GAME_URL }}
            style={styles.screen}
            originWhitelist={['https://*']}
            domStorageEnabled
            sharedCookiesEnabled
            startInLoadingState
            bounces={false}
            overScrollMode="never"
            onNavigationStateChange={state => setCanGoBack(state.canGoBack)}
            onError={() => setFailed(true)}
            onHttpError={event => { if (event.nativeEvent.url === GAME_URL && event.nativeEvent.statusCode >= 400) setFailed(true); }}
            renderLoading={() => <View style={styles.loading}><ActivityIndicator color="#284b3e" size="large" /></View>}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8f2' },
  loading: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f8f2' },
  message: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 18 },
  title: { fontSize: 28, color: '#21332d' },
  detail: { color: '#7a8277', textAlign: 'center', fontSize: 16 },
  button: { backgroundColor: '#daf69b', paddingHorizontal: 28, paddingVertical: 16, borderRadius: 8 },
  buttonText: { color: '#21332d', fontSize: 16, fontWeight: '600' },
});
