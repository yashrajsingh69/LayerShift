/**
 * LayerShift - IndexedDB Project Persistence & Autosave Utility
 * Ensures reliable local storage for large image datasets and vector layer compositions.
 */

import { Project } from '../types';

const DB_NAME = 'LayerShift_DB';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_STATE = 'app_state';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_STATE)) {
        db.createObjectStore(STORE_STATE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const storage = {
  /**
   * Save or update project in IndexedDB
   */
  async saveProject(project: Project): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_PROJECTS, STORE_STATE], 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS);
      const stateStore = tx.objectStore(STORE_STATE);

      // Clone project and exclude non-serializable File object if present
      const cleanProject = {
        ...project,
        updatedAt: Date.now(),
        image: project.image ? {
          ...project.image,
          fileObject: undefined // Exclude runtime File reference
        } : null
      };

      store.put(cleanProject);
      stateStore.put({ key: 'last_active_project_id', id: project.id });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Get project by ID
   */
  async getProject(id: string): Promise<Project | null> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * List all saved projects ordered by last updated
   */
  async listProjects(): Promise<Array<{ id: string; name: string; updatedAt: number; layerCount: number; thumbnail?: string }>> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      const request = store.getAll();

      request.onsuccess = () => {
        const projects: Project[] = request.result || [];
        const summaries = projects.map(p => ({
          id: p.id,
          name: p.name,
          updatedAt: p.updatedAt,
          layerCount: p.layers?.length || 0,
          thumbnail: p.image?.base64Data || p.image?.previewUrl
        })).sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(summaries);
      };
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Delete project by ID
   */
  async deleteProject(id: string): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS);
      store.delete(id);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Retrieve last active project ID
   */
  async getLastActiveProjectId(): Promise<string | null> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_STATE, 'readonly');
      const stateStore = tx.objectStore(STORE_STATE);
      const request = stateStore.get('last_active_project_id');

      request.onsuccess = () => resolve(request.result?.id || null);
      request.onerror = () => reject(request.error);
    });
  }
};
