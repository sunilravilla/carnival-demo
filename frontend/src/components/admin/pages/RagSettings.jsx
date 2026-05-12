import React, { useState, useEffect } from 'react';
import { hpeTheme } from '../../../styles/hpeTheme';
import AdminCard from '../shared/AdminCard';
import AdminButton from '../shared/AdminButton';
import AdminSelect from '../shared/AdminSelect';
import { getRAGConfig, updateRAGConfig, listCollections } from '../../../services/api';

/**
 * RAG Settings page - RAG profile and collection configuration
 */
function RagSettings() {
  const [ragProfile, setRagProfile] = useState('');
  const [availableProfiles, setAvailableProfiles] = useState([]);
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [availableCollections, setAvailableCollections] = useState([]);
  const [profileConfigs, setProfileConfigs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  useEffect(() => {
    loadRAGConfig();
    loadAvailableCollections();
  }, []);

  // Update available collections when profile changes
  useEffect(() => {
    if (ragProfile && profileConfigs[ragProfile]) {
      const config = profileConfigs[ragProfile];
      // Extract collections from the profile config
      const collections = config.RAG_COLLECTION || [];
      setSelectedCollections(Array.isArray(collections) ? collections : [collections]);
    }
  }, [ragProfile, profileConfigs]);

  const loadRAGConfig = async () => {
    setLoading(true);
    try {
      const data = await getRAGConfig();
      setRagProfile(data.RAG_PROFILE || '');
      setProfileConfigs(data.RAG_AVAILABLE_PROFILES || {});

      // Build profile options
      const profiles = Object.keys(data.RAG_AVAILABLE_PROFILES || {}).map((p) => ({
        value: p,
        label: p,
      }));
      setAvailableProfiles(profiles);

      // Set current collections
      const currentProfile = data.RAG_PROFILE || '';
      if (currentProfile && data.RAG_AVAILABLE_PROFILES?.[currentProfile]) {
        const collections = data.RAG_AVAILABLE_PROFILES[currentProfile].RAG_COLLECTION || [];
        setSelectedCollections(Array.isArray(collections) ? collections : [collections]);
      }
    } catch (err) {
      showFeedback('error', 'Failed to load RAG configuration');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableCollections = async () => {
    try {
      const data = await listCollections();
      // API returns array of collection names: ["col1", "col2", ...]
      const collectionNames = Array.isArray(data) ? data : [];
      // Filter out internal collections
      const filtered = collectionNames.filter((name) => !name.startsWith('internal-'));
      setAvailableCollections(filtered);
    } catch (err) {
      console.error('Failed to load collections:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRAGConfig(ragProfile, selectedCollections);
      showFeedback('success', 'RAG settings updated successfully');
    } catch (err) {
      showFeedback('error', 'Failed to update RAG settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = () => {
    loadRAGConfig();
    showFeedback('success', 'Configuration refreshed');
  };

  const showFeedback = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
  };

  // Get collections for multi-select options
  const getCollectionOptions = () => {
    // Use collections fetched from content manager
    return availableCollections.map((c) => ({ value: c, label: c }));
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

      {/* RAG Profile Section */}
      <AdminCard
        title="RAG Profile"
        style={{ position: 'relative', zIndex: 2 }}
        headerAction={
          <AdminButton variant="secondary" onClick={handleRefresh}>
            Refresh
          </AdminButton>
        }
      >
        {loading ? (
          <div style={styles.loading}>Loading...</div>
        ) : (
          <div style={styles.section}>
            <AdminSelect
              label="RAG Profile"
              options={availableProfiles}
              value={ragProfile}
              onChange={setRagProfile}
              placeholder="Select RAG profile"
            />
          </div>
        )}
      </AdminCard>

      {/* Collection Section (V2 only) */}
      {ragProfile === 'V2' && (
        <AdminCard title="Collection" style={{ marginTop: hpeTheme.spacing.lg, position: 'relative', zIndex: 1 }}>
          <div style={styles.section}>
            <AdminSelect
              label="RAG COLLECTION"
              options={getCollectionOptions()}
              value={selectedCollections}
              onChange={setSelectedCollections}
              multiple
              placeholder="Choose an option"
            />
            <p style={styles.hint}>
              Select one or more collections for the RAG system to use.
            </p>
          </div>
        </AdminCard>
      )}

      {/* Save Button */}
      <div style={styles.saveRow}>
        <AdminButton
          variant="primary"
          onClick={handleSave}
          loading={saving}
          disabled={!ragProfile}
        >
          Update
        </AdminButton>
      </div>
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
  saveRow: {
    display: 'flex',
    justifyContent: 'flex-start',
    marginTop: hpeTheme.spacing.lg,
  },
  loading: {
    padding: hpeTheme.spacing.lg,
    textAlign: 'center',
    color: hpeTheme.text.weak,
    fontFamily: hpeTheme.typography.fontFamily,
  },
  hint: {
    margin: 0,
    fontSize: hpeTheme.typography.fontSizes.xs,
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
};

export default RagSettings;
