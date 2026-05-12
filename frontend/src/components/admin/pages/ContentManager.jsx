import React, { useState, useEffect, useRef } from 'react';
import { hpeTheme } from '../../../styles/hpeTheme';
import AdminCard from '../shared/AdminCard';
import AdminButton from '../shared/AdminButton';
import AdminInput from '../shared/AdminInput';
import AdminSelect from '../shared/AdminSelect';
import AdminTable from '../shared/AdminTable';
import AdminModal from '../shared/AdminModal';
import {
  listCollections,
  createCollection,
  deleteCollection,
  listCollectionDocs,
  uploadParsedDocument,
  uploadUnparsedDocument,
  deleteDocument,
  parseDocuments,
} from '../../../services/api';

/**
 * Content Manager page - Collections and Documents CRUD
 */
function ContentManager() {
  const [activeTab, setActiveTab] = useState('collections');
  const [collections, setCollections] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [creating, setCreating] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadCollections();
  }, []);

  useEffect(() => {
    if (selectedCollection && activeTab === 'documents') {
      loadDocuments(selectedCollection);
    }
  }, [selectedCollection, activeTab]);

  const loadCollections = async () => {
    setLoading(true);
    try {
      const data = await listCollections();
      // API returns array of collection names: ["col1", "col2", ...]
      // Filter out internal collections
      const collectionNames = Array.isArray(data) ? data : [];
      const filtered = collectionNames.filter((name) => !name.startsWith('internal-'));

      // Format for display (we'll fetch doc counts separately if needed)
      const formatted = filtered.map((name) => ({
        name,
        documentCount: '-', // Count not available from list_collections
      }));
      setCollections(formatted);
    } catch (err) {
      showFeedback('error', 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async (collection) => {
    setLoading(true);
    try {
      const data = await listCollectionDocs(collection);
      setDocuments(Array.isArray(data) ? data : []);
    } catch (err) {
      showFeedback('error', 'Failed to load documents');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;
    setCreating(true);
    try {
      await createCollection(newCollectionName.trim());
      showFeedback('success', `Collection "${newCollectionName}" created`);
      setNewCollectionName('');
      setShowCreateModal(false);
      loadCollections();
    } catch (err) {
      showFeedback('error', 'Failed to create collection');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCollection = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCollection(deleteTarget.name);
      showFeedback('success', `Collection "${deleteTarget.name}" deleted`);
      setShowDeleteModal(false);
      setDeleteTarget(null);
      loadCollections();
    } catch (err) {
      showFeedback('error', 'Failed to delete collection. Make sure it is empty.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteDocument = async (doc) => {
    if (!window.confirm(`Delete document "${doc.document_name}"?`)) return;
    try {
      await deleteDocument(selectedCollection, doc.document_id);
      showFeedback('success', 'Document deleted');
      loadDocuments(selectedCollection);
    } catch (err) {
      showFeedback('error', 'Failed to delete document');
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0 || !selectedCollection) return;

    setUploading(true);
    let successCount = 0;
    let failCount = 0;

    for (const file of files) {
      try {
        const ext = file.name.split('.').pop().toLowerCase();
        const isParsed = ['txt', 'md'].includes(ext);

        if (isParsed) {
          await uploadParsedDocument(file, selectedCollection);
        } else {
          await uploadUnparsedDocument(file, selectedCollection);
        }
        successCount++;
      } catch (err) {
        failCount++;
      }
    }

    setUploading(false);
    fileInputRef.current.value = '';

    if (successCount > 0) {
      showFeedback(
        'success',
        `${successCount} file(s) uploaded${failCount > 0 ? `, ${failCount} failed` : ''}`
      );
      loadDocuments(selectedCollection);
    } else {
      showFeedback('error', 'Failed to upload files');
    }
  };

  const handleParseDocuments = async () => {
    if (!selectedCollection) return;
    setParsing(true);
    showFeedback('success', 'Parsing started — this may take a minute...');
    try {
      await parseDocuments(selectedCollection);
      showFeedback('success', 'Parsing complete');
      loadDocuments(selectedCollection);
    } catch (err) {
      showFeedback('error', 'Parsing failed');
    } finally {
      setParsing(false);
    }
  };

  const showFeedback = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
  };

  const collectionColumns = [
    { key: 'name', label: 'Collection Name', width: '60%' },
    {
      key: 'documentCount',
      label: 'Documents',
      width: '20%',
      render: (count) => `${count} documents`,
    },
    {
      key: 'actions',
      label: 'Actions',
      width: '20%',
      render: (_, row) => (
        <AdminButton
          variant="danger"
          onClick={(e) => {
            e.stopPropagation();
            setDeleteTarget(row);
            setShowDeleteModal(true);
          }}
          style={{ padding: '4px 12px', fontSize: '12px' }}
        >
          Delete
        </AdminButton>
      ),
    },
  ];

  const documentColumns = [
    { key: 'document_name', label: 'Name', width: '40%' },
    {
      key: 'original_type',
      label: 'Type',
      width: '15%',
      render: (val, row) => val || row.parsed_type || '-',
    },
    {
      key: 'metadata',
      label: 'Upload Date',
      width: '25%',
      render: (meta) => {
        const date = meta?.upload_date || meta?.created_at;
        return date ? new Date(date).toLocaleDateString() : '-';
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      width: '20%',
      render: (_, row) => (
        <AdminButton
          variant="danger"
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteDocument(row);
          }}
          style={{ padding: '4px 12px', fontSize: '12px' }}
        >
          Delete
        </AdminButton>
      ),
    },
  ];

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

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'collections' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('collections')}
        >
          Collections
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'documents' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('documents')}
        >
          Documents
        </button>
      </div>

      {/* Collections Tab */}
      {activeTab === 'collections' && (
        <AdminCard
          title="Collections"
          headerAction={
            <AdminButton variant="primary" onClick={() => setShowCreateModal(true)}>
              + Create
            </AdminButton>
          }
        >
          <AdminTable
            columns={collectionColumns}
            data={collections}
            loading={loading}
            rowKey="name"
            emptyMessage="No collections found"
          />
        </AdminCard>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <>
          <AdminCard title="Select Collection" style={{ marginBottom: hpeTheme.spacing.lg }}>
            <AdminSelect
              options={collections.map((c) => ({ value: c.name, label: c.name }))}
              value={selectedCollection}
              onChange={setSelectedCollection}
              placeholder="Select a collection"
            />
          </AdminCard>

          {selectedCollection && (
            <AdminCard
              title={`Documents in "${selectedCollection}"`}
              headerAction={
                <div style={{ display: 'flex', gap: hpeTheme.spacing.sm }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                    accept=".txt,.md,.pdf,.csv,.json"
                  />
                  <AdminButton
                    variant="secondary"
                    onClick={handleParseDocuments}
                    loading={parsing}
                  >
                    Parse
                  </AdminButton>
                  <AdminButton
                    variant="primary"
                    onClick={() => fileInputRef.current?.click()}
                    loading={uploading}
                  >
                    + Upload
                  </AdminButton>
                </div>
              }
            >
              <AdminTable
                columns={documentColumns}
                data={documents}
                loading={loading}
                rowKey="document_id"
                emptyMessage="No documents in this collection"
              />
            </AdminCard>
          )}
        </>
      )}

      {/* Create Collection Modal */}
      <AdminModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Collection"
        footer={
          <>
            <AdminButton variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </AdminButton>
            <AdminButton
              variant="primary"
              onClick={handleCreateCollection}
              loading={creating}
              disabled={!newCollectionName.trim()}
            >
              Create
            </AdminButton>
          </>
        }
      >
        <AdminInput
          label="Collection Name"
          value={newCollectionName}
          onChange={setNewCollectionName}
          placeholder="Enter collection name"
        />
      </AdminModal>

      {/* Delete Collection Modal */}
      <AdminModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Collection"
        footer={
          <>
            <AdminButton variant="secondary" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </AdminButton>
            <AdminButton variant="danger" onClick={handleDeleteCollection} loading={deleting}>
              Delete
            </AdminButton>
          </>
        }
      >
        <p style={styles.deleteText}>
          Are you sure you want to delete the collection "{deleteTarget?.name}"?
          <br />
          <strong>This action cannot be undone.</strong>
        </p>
      </AdminModal>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1000px',
  },
  tabs: {
    display: 'flex',
    gap: hpeTheme.spacing.xs,
    marginBottom: hpeTheme.spacing.lg,
    borderBottom: `1px solid ${hpeTheme.border.weak}`,
    paddingBottom: hpeTheme.spacing.xs,
  },
  tab: {
    padding: `${hpeTheme.spacing.sm} ${hpeTheme.spacing.md}`,
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    fontSize: hpeTheme.typography.fontSizes.sm,
    fontFamily: hpeTheme.typography.fontFamily,
    fontWeight: hpeTheme.typography.fontWeights.medium,
    color: hpeTheme.text.weak,
    cursor: 'pointer',
    transition: `all ${hpeTheme.transitions.fast}`,
  },
  tabActive: {
    color: hpeTheme.brand.green,
    borderBottomColor: hpeTheme.brand.green,
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
  deleteText: {
    margin: 0,
    fontSize: hpeTheme.typography.fontSizes.md,
    color: hpeTheme.text.main,
    fontFamily: hpeTheme.typography.fontFamily,
    lineHeight: 1.6,
  },
};

export default ContentManager;
