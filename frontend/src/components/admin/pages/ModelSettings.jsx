import React, { useState, useEffect } from 'react';
import { hpeTheme } from '../../../styles/hpeTheme';
import AdminCard from '../shared/AdminCard';
import AdminButton from '../shared/AdminButton';
import AdminSelect from '../shared/AdminSelect';
import AdminInput from '../shared/AdminInput';
import AdminModal from '../shared/AdminModal';
import {
  getLLMConfig,
  updateLLM,
  getSystemConfig,
  updateSystemConfig,
  repairSystemConfig,
  getTTSConfig,
  updateTTS,
  regenerateFillers,
} from '../../../services/api';

/**
 * Model Settings page - LLM profile and system prompt configuration
 */
function ModelSettings() {
  // LLM Profile state
  const [llmProfile, setLlmProfile] = useState('');
  const [availableProfiles, setAvailableProfiles] = useState([]);
  const [llmLoading, setLlmLoading] = useState(true);
  const [llmSaving, setLlmSaving] = useState(false);

  // System Prompt state
  const [systemPrompt, setSystemPrompt] = useState('');
  const [promptLoading, setPromptLoading] = useState(true);
  const [promptSaving, setPromptSaving] = useState(false);
  const [configError, setConfigError] = useState(false);

  // TTS Provider state
  const [ttsProvider, setTtsProvider] = useState('');
  const [availableProviders, setAvailableProviders] = useState([]);
  const [voiceId, setVoiceId] = useState('');
  const [availableVoices, setAvailableVoices] = useState([]);
  const [ttsLoading, setTtsLoading] = useState(true);
  const [ttsSaving, setTtsSaving] = useState(false);

  // Repair modal state
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [repairing, setRepairing] = useState(false);

  // Feedback
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Load initial data
  useEffect(() => {
    loadLLMConfig();
    loadSystemConfig();
    loadTTSConfig();
  }, []);

  const loadLLMConfig = async () => {
    setLlmLoading(true);
    try {
      const data = await getLLMConfig();
      setLlmProfile(data.LLM_PROFILE || '');
      setAvailableProfiles(
        (data.AVAILABLE_PROFILES || []).map((p) => ({ value: p, label: p }))
      );
    } catch (err) {
      showFeedback('error', 'Failed to load LLM configuration');
    } finally {
      setLlmLoading(false);
    }
  };

  const loadTTSConfig = async () => {
    setTtsLoading(true);
    try {
      const data = await getTTSConfig();
      setTtsProvider(data.TTS_PROVIDER || 'elevenlabs');
      setAvailableProviders(
        (data.AVAILABLE_PROVIDERS || []).map((p) => ({ value: p, label: p === 'elevenlabs' ? 'ElevenLabs' : 'Kokoro' }))
      );
      setVoiceId(data.VOICE_ID || '');
      setAvailableVoices(
        (data.AVAILABLE_VOICES || []).map((v) => ({ value: v.id, label: v.label }))
      );
    } catch (err) {
      showFeedback('error', 'Failed to load TTS configuration');
    } finally {
      setTtsLoading(false);
    }
  };

  const handleSaveTTS = async () => {
    setTtsSaving(true);
    try {
      await updateTTS(ttsProvider, ttsProvider === 'elevenlabs' ? voiceId : null);
      // Notify ChatInterface to re-fetch filler audio for the new voice
      window.dispatchEvent(new CustomEvent('aria-voice-changed', { detail: { voiceId } }));
      showFeedback('success', 'TTS settings updated successfully');
    } catch (err) {
      showFeedback('error', 'Failed to update TTS settings');
    } finally {
      setTtsSaving(false);
    }
  };

  const loadSystemConfig = async () => {
    setPromptLoading(true);
    setConfigError(false);
    try {
      const data = await getSystemConfig();
      setSystemPrompt(data.SYSTEM_PROMPT || '');
    } catch (err) {
      console.error('Config load error:', err);
      setConfigError(true);
      showFeedback('error', 'System config is corrupted or unavailable');
    } finally {
      setPromptLoading(false);
    }
  };

  const handleSaveLLM = async () => {
    setLlmSaving(true);
    try {
      await updateLLM(llmProfile);
      showFeedback('success', 'LLM profile updated successfully');
    } catch (err) {
      showFeedback('error', 'Failed to update LLM profile');
    } finally {
      setLlmSaving(false);
    }
  };

  const handleSavePrompt = async () => {
    setPromptSaving(true);
    try {
      await updateSystemConfig(systemPrompt);
      showFeedback('success', 'System prompt updated successfully');
      setConfigError(false);
    } catch (err) {
      showFeedback('error', 'Failed to update system prompt');
    } finally {
      setPromptSaving(false);
    }
  };

  const handleRepairConfig = async () => {
    setRepairing(true);
    try {
      await repairSystemConfig();
      showFeedback('success', 'System config repaired with default prompt');
      setShowRepairModal(false);
      setConfigError(false);
      // Reload the config
      loadSystemConfig();
    } catch (err) {
      showFeedback('error', 'Failed to repair system config');
    } finally {
      setRepairing(false);
    }
  };

  const showFeedback = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
  };

  return (
    <div style={styles.container}>
      {/* Feedback Banner */}
      {feedback.message && (
        <div
          style={{
            ...styles.feedback,
            background:
              feedback.type === 'success'
                ? 'rgba(1, 169, 130, 0.1)'
                : 'rgba(197, 78, 75, 0.1)',
            borderColor:
              feedback.type === 'success'
                ? hpeTheme.admin.status.success
                : hpeTheme.admin.status.error,
            color:
              feedback.type === 'success'
                ? hpeTheme.admin.status.success
                : hpeTheme.admin.status.error,
          }}
        >
          {feedback.type === 'success' ? '\u2713' : '\u2717'} {feedback.message}
        </div>
      )}

      {/* LLM Profile Section */}
      <AdminCard title="LLM Profile">
        {llmLoading ? (
          <div style={styles.loading}>Loading...</div>
        ) : (
          <div style={styles.section}>
            <AdminSelect
              label="Model"
              options={availableProfiles}
              value={llmProfile}
              onChange={setLlmProfile}
              placeholder="Select LLM profile"
            />
            <div style={styles.buttonRow}>
              <AdminButton
                variant="primary"
                onClick={handleSaveLLM}
                loading={llmSaving}
                disabled={!llmProfile}
              >
                Update
              </AdminButton>
            </div>
          </div>
        )}
      </AdminCard>

      {/* TTS Provider Section */}
      <AdminCard title="TTS Provider" style={{ marginTop: hpeTheme.spacing.lg }}>
        {ttsLoading ? (
          <div style={styles.loading}>Loading...</div>
        ) : (
          <div style={styles.section}>
            <AdminSelect
              label="Provider"
              options={availableProviders}
              value={ttsProvider}
              onChange={setTtsProvider}
              placeholder="Select TTS provider"
            />
            {ttsProvider === 'elevenlabs' && availableVoices.length > 0 && (
              <AdminSelect
                label="Voice"
                options={availableVoices}
                value={voiceId}
                onChange={setVoiceId}
                placeholder="Select voice"
              />
            )}
            <div style={styles.buttonRow}>
              <AdminButton
                variant="primary"
                onClick={handleSaveTTS}
                loading={ttsSaving}
                disabled={!ttsProvider}
              >
                Update
              </AdminButton>
            </div>
          </div>
        )}
      </AdminCard>

      {/* System Prompt Section */}
      <AdminCard title="System Prompt" style={{ marginTop: hpeTheme.spacing.lg }}>
        {promptLoading ? (
          <div style={styles.loading}>Loading...</div>
        ) : configError ? (
          <div style={styles.errorSection}>
            <div style={styles.errorIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={hpeTheme.admin.status.error} strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 style={styles.errorTitle}>Configuration Error</h3>
            <p style={styles.errorText}>
              The system prompt configuration is corrupted or unavailable.
              This may cause the assistant to give generic responses instead of the configured persona.
            </p>
            <div style={styles.buttonRow}>
              <AdminButton variant="secondary" onClick={loadSystemConfig}>
                Retry
              </AdminButton>
              <AdminButton variant="danger" onClick={() => setShowRepairModal(true)}>
                Repair Config
              </AdminButton>
            </div>
          </div>
        ) : (
          <div style={styles.section}>
            <AdminInput
              label="Current prompt"
              value={systemPrompt}
              onChange={setSystemPrompt}
              multiline
              rows={12}
              maxLength={100000}
              showCount
              placeholder="Enter system prompt..."
            />
            <div style={styles.buttonRow}>
              <AdminButton
                variant="primary"
                onClick={handleSavePrompt}
                loading={promptSaving}
              >
                Update
              </AdminButton>
            </div>
          </div>
        )}
      </AdminCard>

      {/* Repair Confirmation Modal */}
      <AdminModal
        isOpen={showRepairModal}
        onClose={() => setShowRepairModal(false)}
        title="Repair System Configuration"
        footer={
          <>
            <AdminButton variant="secondary" onClick={() => setShowRepairModal(false)}>
              Cancel
            </AdminButton>
            <AdminButton variant="danger" onClick={handleRepairConfig} loading={repairing}>
              Repair Config
            </AdminButton>
          </>
        }
      >
        <div style={styles.repairContent}>
          <p style={styles.repairText}>
            This will reset the system prompt to a default training advisor configuration:
          </p>
          <div style={styles.repairPreview}>
            <code style={styles.codeBlock}>
              You are ARIA, an AI Training Advisor powered by HPE AI Services...
            </code>
          </div>
          <p style={styles.repairWarning}>
            <strong>Note:</strong> Your custom prompt (if any) will be lost.
            You can update it again after repair.
          </p>
        </div>
      </AdminModal>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '800px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: hpeTheme.spacing.md,
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'flex-start',
    gap: hpeTheme.spacing.sm,
    marginTop: hpeTheme.spacing.sm,
  },
  loading: {
    padding: hpeTheme.spacing.lg,
    textAlign: 'center',
    color: hpeTheme.text.weak,
    fontFamily: hpeTheme.typography.fontFamily,
  },
  feedback: {
    padding: hpeTheme.spacing.md,
    marginBottom: hpeTheme.spacing.lg,
    borderRadius: hpeTheme.borderRadius.md,
    border: '1px solid',
    fontSize: hpeTheme.typography.fontSizes.sm,
    fontFamily: hpeTheme.typography.fontFamily,
    display: 'flex',
    alignItems: 'center',
    gap: hpeTheme.spacing.sm,
  },
  errorSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: hpeTheme.spacing.xl,
    textAlign: 'center',
  },
  errorIcon: {
    marginBottom: hpeTheme.spacing.md,
  },
  errorTitle: {
    margin: 0,
    fontSize: hpeTheme.typography.fontSizes.lg,
    fontWeight: hpeTheme.typography.fontWeights.bold,
    color: hpeTheme.admin.status.error,
    fontFamily: hpeTheme.typography.fontFamily,
  },
  errorText: {
    margin: `${hpeTheme.spacing.sm} 0 ${hpeTheme.spacing.lg}`,
    fontSize: hpeTheme.typography.fontSizes.md,
    color: hpeTheme.text.weak,
    fontFamily: hpeTheme.typography.fontFamily,
    maxWidth: '400px',
    lineHeight: 1.5,
  },
  repairContent: {
    fontFamily: hpeTheme.typography.fontFamily,
  },
  repairText: {
    margin: 0,
    fontSize: hpeTheme.typography.fontSizes.md,
    color: hpeTheme.text.main,
    lineHeight: 1.5,
  },
  repairPreview: {
    margin: `${hpeTheme.spacing.md} 0`,
    padding: hpeTheme.spacing.md,
    background: hpeTheme.background.contrast,
    borderRadius: hpeTheme.borderRadius.sm,
    border: `1px solid ${hpeTheme.border.weak}`,
  },
  codeBlock: {
    fontSize: hpeTheme.typography.fontSizes.sm,
    color: hpeTheme.text.weak,
    fontFamily: 'monospace',
  },
  repairWarning: {
    margin: 0,
    fontSize: hpeTheme.typography.fontSizes.sm,
    color: hpeTheme.admin.status.warning,
    lineHeight: 1.5,
  },
};

export default ModelSettings;
