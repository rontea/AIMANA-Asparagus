
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { dbGet, UPLOADS_DIR } from '../db.js';
import { sanitizeDirName } from '../utils/paths.js';

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    let dest = UPLOADS_DIR;
    // Extract projectId from /api/projects/:id/...
    const match = req.originalUrl.match(/\/projects\/([^\/]+)\//);
    const assetType = req.headers['x-asset-type']; 
    const parentItemId = req.headers['x-parent-item-id'];

    if (match && match[1]) {
      try {
        const project = await dbGet("SELECT name FROM projects WHERE id = ?", [match[1]]);
        if (project) {
          const safeProjectName = sanitizeDirName(project.name);
          
          if (assetType === 'reference' || parentItemId) {
            // New path: storage/uploads/Neural_Reference/{projectName}/{parentItemID}/
            // If parentItemId is missing (standalone reference), we still put it in Neural_Reference/projectName
            dest = path.join(UPLOADS_DIR, 'Neural_Reference', safeProjectName);
            if (parentItemId) {
                dest = path.join(dest, parentItemId);
            }
          } else {
            // Standard path: storage/uploads/{projectName}/
            dest = path.join(UPLOADS_DIR, safeProjectName);
          }

          if (!fs.existsSync(dest)) {
              fs.mkdirSync(dest, { recursive: true });
          }
        }
      } catch (err) {
        console.error("[MULTER_DEST_ERR]", err);
      }
    }
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    // Use the specific ID of the asset passed from the frontend
    const itemId = req.headers['x-item-id'];
    const ext = path.extname(file.originalname);
    
    // Fallback if ID is missing (should not happen with current frontend logic)
    const finalName = itemId ? `${itemId}${ext}` : `${Date.now()}${ext}`;
    cb(null, finalName);
  }
});

export const upload = multer({ storage });
