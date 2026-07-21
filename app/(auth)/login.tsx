import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../../lib/supabase';

const CORAL = '#FF5C5C';
const PRIVACY_URL = 'https://cgriffgoat.github.io/verve-app/privacy.html';
const TERMS_URL = 'https://cgriffgoat.github.io/verve-app/terms.html';

export default function LoginScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  const handleAppleSignIn = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (credential.identityToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });
        if (error) Alert.alert('Sign in failed', error.message);
      }
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Error', e.message);
      }
    }
  };

  const handleEmailAuth = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }

    setLoading(true);

    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });

    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else if (mode === 'signup') {
      Alert.alert(
        'Check your email',
        'We sent a confirmation link to your inbox. Click it to activate your account.',
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Brand ── */}
          <View style={styles.brand}>
            <View style={styles.logoMark}>
              <Text style={styles.logoLetter}>V</Text>
            </View>
            <Text style={styles.appName}>Vervi</Text>
            <Text style={styles.tagline}>Discover what's good around you</Text>
          </View>

          {/* ── Apple Sign In (native builds only) ── */}
          {appleAvailable && (
            <>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={14}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
              {/* ── Divider ── */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
            </>
          )}

          {/* ── Divider (shown when Apple unavailable) ── */}
          {!appleAvailable && (
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>sign in with email</Text>
              <View style={styles.dividerLine} />
            </View>
          )}

          {/* ── Email / Password form ── */}
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#BDBDBD"
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#BDBDBD"
              secureTextEntry
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleEmailAuth}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Toggle signin / signup ── */}
          <TouchableOpacity
            style={styles.toggle}
            onPress={() => setMode(m => (m === 'signin' ? 'signup' : 'signin'))}
          >
            <Text style={styles.toggleText}>
              {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <Text style={styles.toggleLink}>
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </Text>
            </Text>
          </TouchableOpacity>

          <Text style={styles.legal}>
            By continuing you agree to our{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>
              Terms of Service
            </Text>
            {' '}and{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
              Privacy Policy
            </Text>
            .
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
  },

  // Brand
  brand: { alignItems: 'center', marginBottom: 48 },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: CORAL,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: CORAL,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  logoLetter: {
    fontSize: 38,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1A1A1A',
    letterSpacing: -1,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
  },

  // Apple button
  appleButton: {
    width: '100%',
    height: 54,
    marginBottom: 20,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E5E5' },
  dividerText: { fontSize: 13, color: '#BDBDBD', fontWeight: '500' },

  // Form
  form: { gap: 12, marginBottom: 24 },
  input: {
    height: 54,
    backgroundColor: '#F7F7F7',
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  submitButton: {
    height: 54,
    backgroundColor: CORAL,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    shadowColor: CORAL,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2 },

  // Toggle
  toggle: { alignItems: 'center', marginBottom: 28 },
  toggleText: { fontSize: 14, color: '#8E8E93' },
  toggleLink: { color: CORAL, fontWeight: '600' },

  // Legal
  legal: {
    fontSize: 11,
    color: '#BDBDBD',
    textAlign: 'center',
    lineHeight: 16,
  },
  legalLink: {
    color: CORAL,
    fontWeight: '600',
  },
});
