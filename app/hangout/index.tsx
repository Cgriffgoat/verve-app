import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { createHangout, joinHangout } from '../../lib/hangouts';
import { CitySearchModal } from '../../components/CitySearchModal';

const CORAL = '#FF5C5C';
const INDIGO = '#5B7FFF';

type SelectedCity = { latitude: number; longitude: number; city: string };

export default function HangoutLandingScreen() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [selectedCity, setSelectedCity] = useState<SelectedCity | null>(null);
  const [cityModalVisible, setCityModalVisible] = useState(false);
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      const displayName = user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Someone';
      const hangout = await createHangout(
        user.id,
        displayName,
        title,
        selectedCity
          ? { latitude: selectedCity.latitude, longitude: selectedCity.longitude, city_name: selectedCity.city }
          : undefined,
      );
      router.replace(`/hangout/${hangout.id}`);
    } catch (e: any) {
      setError(e.message);
    }
    setCreating(false);
  };

  const handleJoin = async () => {
    if (code.trim().length < 6) { setError('Enter a 6-character code'); return; }
    setJoining(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      const displayName = user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Someone';
      const hangout = await joinHangout(code, user.id, displayName);
      router.replace(`/hangout/${hangout.id}`);
    } catch (e: any) {
      setError(e.message);
    }
    setJoining(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <CitySearchModal
        visible={cityModalVisible}
        title="Trip location"
        onClose={() => setCityModalVisible(false)}
        onSelect={loc => {
          setSelectedCity(loc);
          setCityModalVisible(false);
        }}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Plan Together</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.intro}>
            Create a hangout to vote on what to do, or join one your friend started.
          </Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          {/* ── Create section ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBg, { backgroundColor: '#FFF0F0' }]}>
                <Text style={styles.sectionIcon}>🤝</Text>
              </View>
              <View>
                <Text style={styles.sectionTitle}>Start a hangout</Text>
                <Text style={styles.sectionSub}>Get a code to share with friends</Text>
              </View>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Name it (optional — e.g. Saturday plans)"
              placeholderTextColor="#BDBDBD"
              value={title}
              onChangeText={setTitle}
              returnKeyType="done"
            />

            {/* City picker */}
            <TouchableOpacity
              style={styles.cityRow}
              onPress={() => setCityModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.cityRowIcon}>
                {selectedCity ? '📌' : '📍'}
              </Text>
              <Text style={[styles.cityRowText, !selectedCity && styles.cityRowPlaceholder]}>
                {selectedCity ? selectedCity.city : 'Add a trip location (optional)'}
              </Text>
              {selectedCity ? (
                <TouchableOpacity
                  onPress={() => setSelectedCity(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.cityRowClear}>✕</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.cityRowChevron}>›</Text>
              )}
            </TouchableOpacity>

            {selectedCity && (
              <TouchableOpacity onPress={() => setCityModalVisible(true)}>
                <Text style={styles.changeCityLink}>Change location</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: CORAL }, creating && styles.btnDisabled]}
              onPress={handleCreate}
              disabled={creating}
              activeOpacity={0.85}
            >
              {creating
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>Start hangout →</Text>
              }
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* ── Join section ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBg, { backgroundColor: '#EEF2FF' }]}>
                <Text style={styles.sectionIcon}>🔑</Text>
              </View>
              <View>
                <Text style={styles.sectionTitle}>Join with a code</Text>
                <Text style={styles.sectionSub}>Enter the 6-character code from a friend</Text>
              </View>
            </View>

            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="ABC123"
              placeholderTextColor="#BDBDBD"
              value={code}
              onChangeText={t => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleJoin}
            />

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: INDIGO }, joining && styles.btnDisabled]}
              onPress={handleJoin}
              disabled={joining}
              activeOpacity={0.85}
            >
              {joining
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>Join hangout →</Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 28, color: '#1A1A1A', fontWeight: '300', lineHeight: 32 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#1A1A1A' },

  scrollContent: { padding: 20, paddingBottom: 60 },
  intro: { fontSize: 14, color: '#8E8E93', lineHeight: 20, marginBottom: 24, textAlign: 'center' },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    backgroundColor: '#FFF5F5',
    padding: 12,
    borderRadius: 10,
  },

  section: {
    backgroundColor: '#FAFAFA',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    gap: 14,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionIconBg: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionIcon: { fontSize: 22 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  sectionSub: { fontSize: 12, color: '#8E8E93', marginTop: 2 },

  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  codeInput: { fontSize: 22, fontWeight: '700', letterSpacing: 6, textAlign: 'center' },

  // City picker row
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  cityRowIcon: { fontSize: 17 },
  cityRowText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  cityRowPlaceholder: { fontWeight: '400', color: '#BDBDBD' },
  cityRowChevron: { fontSize: 18, color: '#C7C7CC' },
  cityRowClear: { fontSize: 14, color: '#8E8E93', fontWeight: '600', paddingHorizontal: 4 },
  changeCityLink: { fontSize: 13, color: CORAL, fontWeight: '600', marginTop: -6 },

  primaryBtn: {
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#EFEFEF' },
  dividerLabel: { fontSize: 12, fontWeight: '600', color: '#C7C7CC' },
});
