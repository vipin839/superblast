import { getAdminFirestore } from './firebaseAdmin';

/**
 * Save a new BLAST job to Firestore
 * Stores in top-level `jobs/{jobId}` AND `users/{uid}/jobs/{jobId}` for maximum reliability
 * @param {string} uid - Firebase user ID
 * @param {object} jobData - Job data to save
 * @returns {string} jobId
 */
export async function saveJob(uid, jobData) {
  const db = getAdminFirestore();

  const record = {
    ...jobData,
    uid: uid || 'anonymous',
    createdAt: jobData.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Save to top-level collection for fast direct lookups (no collectionGroup index required)
  const topJobRef = db.collection('jobs').doc(jobData.id);
  await topJobRef.set(record, { merge: true });

  // If user is authenticated, also save under user subcollection
  if (uid) {
    const userJobRef = db.collection('users').doc(uid).collection('jobs').doc(jobData.id);
    await userJobRef.set(record, { merge: true }).catch(err => {
      console.warn('Subcollection job save warning:', err.message);
    });
  }

  return jobData.id;
}

/**
 * Get a specific job by ID (direct document lookup)
 * @param {string} jobId - Job ID
 * @returns {object|null} Job data or null if not found
 */
export async function getJobById(jobId) {
  const db = getAdminFirestore();

  // 1. Try top-level `jobs/{jobId}` collection first (fastest, no index required)
  try {
    const doc = await db.collection('jobs').doc(jobId).get();
    if (doc.exists) {
      return { id: doc.id, ...doc.data() };
    }
  } catch (err) {
    console.warn('Top-level job fetch error:', err.message);
  }

  // 2. Fallback to collectionGroup lookup across subcollections
  try {
    const snapshot = await db.collectionGroup('jobs').where('id', '==', jobId).limit(1).get();
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    }
  } catch (err) {
    console.warn('CollectionGroup job fetch error:', err.message);
  }

  return null;
}

/**
 * Get job by user ID and job ID
 */
export async function getJob(uid, jobId) {
  if (!uid) return getJobById(jobId);

  const db = getAdminFirestore();

  try {
    const doc = await db.collection('users').doc(uid).collection('jobs').doc(jobId).get();
    if (doc.exists) return { id: doc.id, ...doc.data() };
  } catch {}

  return getJobById(jobId);
}

/**
 * List jobs for a user, ordered by creation date
 * @param {string} uid - Firebase user ID
 * @param {number} limit - Max jobs to return
 * @returns {Array} Job list
 */
export async function getUserJobs(uid, limit = 50) {
  const db = getAdminFirestore();

  // Try top-level `jobs` collection filtered by uid
  try {
    const snapshot = await db.collection('jobs')
      .where('uid', '==', uid)
      .limit(limit)
      .get();

    if (!snapshot.empty) {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      docs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      return docs;
    }
  } catch (err) {
    console.warn('Top-level user jobs query warning:', err.message);
  }

  // Fallback to user subcollection
  try {
    const snapshot = await db.collection('users').doc(uid).collection('jobs').get();
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    docs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return docs.slice(0, limit);
  } catch (err) {
    console.warn('User subcollection jobs query error:', err.message);
  }

  return [];
}

/**
 * Update job status and optional fields by ID
 * @param {string} jobId - Job ID
 * @param {object} updates - Fields to update
 */
export async function updateJobById(jobId, updates) {
  const db = getAdminFirestore();
  const payload = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  let updated = false;

  // 1. Update top-level collection
  try {
    await db.collection('jobs').doc(jobId).set(payload, { merge: true });
    updated = true;
  } catch (err) {
    console.warn('Top-level job update error:', err.message);
  }

  // 2. Update subcollection if found via collectionGroup
  try {
    const snapshot = await db.collectionGroup('jobs').where('id', '==', jobId).limit(1).get();
    if (!snapshot.empty) {
      await snapshot.docs[0].ref.set(payload, { merge: true });
      updated = true;
    }
  } catch {}

  return updated;
}

export async function updateJob(uid, jobId, updates) {
  return updateJobById(jobId, updates);
}

/**
 * Delete a job by ID from all collections
 * @param {string} jobId - Job ID
 */
export async function deleteJobById(jobId) {
  const db = getAdminFirestore();
  let deleted = false;

  // 1. Delete from top-level collection
  try {
    const docRef = db.collection('jobs').doc(jobId);
    if ((await docRef.get()).exists) {
      await docRef.delete();
      deleted = true;
    }
  } catch (err) {
    console.warn('Top-level job delete error:', err.message);
  }

  // 2. Delete from subcollection if found via collectionGroup
  try {
    const snapshot = await db.collectionGroup('jobs').where('id', '==', jobId).limit(1).get();
    if (!snapshot.empty) {
      await snapshot.docs[0].ref.delete();
      deleted = true;
    }
  } catch (err) {
    console.warn('Subcollection job delete error:', err.message);
  }

  return deleted;
}
