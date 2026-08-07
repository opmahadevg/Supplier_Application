# Proquoment Supplier App — Google Workspace Backend Setup

This replaces Supabase with Google Drive (file storage) + Google Sheets (database).
All data lives in **proquoment@gmail.com**.

---

## Prerequisites

- You are signed into `proquoment@gmail.com` in your browser
- You have access to [Google Drive](https://drive.google.com) and [Google Sheets](https://sheets.google.com)

---

## Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → **+ Blank**
2. Rename it: `Proquoment Supplier Submissions`
3. Copy the **Sheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  >>>THIS_PART<<<  /edit
   ```
4. Paste it into `Code.gs` → `CONFIG.SHEET_ID`

---

## Step 2 — Create the Drive Folder

1. Go to [drive.google.com](https://drive.google.com) → **+ New → Folder**
2. Name it exactly: `Proquoment Suppliers`
3. Open the folder. Copy the **Folder ID** from the URL:
   ```
   https://drive.google.com/drive/folders/  >>>THIS_PART<<<
   ```
4. Paste it into `Code.gs` → `CONFIG.PARENT_FOLDER_ID`

---

## Step 3 — Create the Apps Script Project

1. Go to [script.google.com](https://script.google.com) → **+ New project**
2. Rename the project: `Proquoment Supplier API`
3. Delete all existing code in `Code.gs`
4. Paste the entire contents of `backend/Code.gs` from this repo
5. Confirm `SHEET_ID` and `PARENT_FOLDER_ID` are filled in

---

## Step 4 — Run setupSheetHeaders (once)

1. In the Apps Script editor, select function: `setupSheetHeaders`
2. Click **▶ Run**
3. Grant permissions when prompted (sign in as proquoment@gmail.com → Allow)
4. Check execution log — should say: `✅ Sheet headers created. 44 columns.`
5. Open your Google Sheet — Row 1 should now have blue headers

---

## Step 5 — Deploy as Web App

1. Click **Deploy → New deployment**
2. Click the gear ⚙️ next to "Type" → select **Web app**
3. Fill in:
   - **Description**: `v1 - Initial deployment`
   - **Execute as**: `Me (proquoment@gmail.com)`
   - **Who has access**: `Anyone`
4. Click **Deploy**
5. Click **Authorize access** → sign in → Allow
6. Copy the **Web App URL** — looks like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

---

## Step 6 — Connect Frontend

1. Open `Supplier_Application-main/index.html`
2. Find this line near the top:
   ```javascript
   const CONFIG = {
     APPS_SCRIPT_URL: 'PASTE_YOUR_DEPLOYED_SCRIPT_URL_HERE'
   };
   ```
3. Replace `PASTE_YOUR_DEPLOYED_SCRIPT_URL_HERE` with the URL from Step 5

---

## Step 7 — Test

1. Open `index.html` in a browser (or your hosting)
2. Fill in all required fields
3. Upload a test PDF and a test image
4. Click **Submit Application**
5. Verify:
   - ✅ Success message appears on form
   - ✅ New folder created in Drive → `Proquoment Suppliers/[CompanyName] - [Date]/`
   - ✅ Files appear inside the folder
   - ✅ New row added to Google Sheet with all data + Drive URLs

---

## Updating the Script Later

Whenever you modify `Code.gs`:

1. Go to [script.google.com](https://script.google.com) → your project
2. Paste updated code
3. **Deploy → Manage deployments → Edit (pencil) → New version → Deploy**
4. The URL stays the same — no frontend change needed

---

## Drive Folder Structure

```
proquoment@gmail.com Drive
└── Proquoment Suppliers/
    ├── ABC Exports - 2026-08-07/
    │   ├── 20260807_154530_catalog.pdf
    │   └── 20260807_154531_factory_photo.jpg
    └── XYZ Textiles - 2026-08-08/
        └── 20260808_093012_product_sheet.pdf
```

## Sheet Column Reference

| Col | Field |
|-----|-------|
| A | Submission ID |
| B | Submission Timestamp |
| C | Factory Name |
| D–J | Address fields |
| K–L | Factory Size, Employees |
| M–V | Production & Payment details |
| W–AF | Contact information |
| AG–AH | Website, Previous Clients |
| AI–AJ | Supplier Folder URL + ID |
| AK–AL | Catalog File URL + ID |
| AM–AN | Photo URLs + IDs |
| AO | Total Files Uploaded |
| AP | Source |
| AQ | Verification Status |
| AR | AI Review Status |

---

## Security Notes

- Google credentials **never** touch the frontend
- The Apps Script runs server-side as proquoment@gmail.com
- Files are shared as "anyone with link can view" — not publicly indexed
- Executable file types (`.exe`, `.sh`, `.bat`, etc.) are rejected by MIME type check
- Files over 50 MB are rejected

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| CORS error in browser console | Redeploy → ensure "Who has access: Anyone" |
| `Sheet not found` error | Run `setupSheetHeaders()` first |
| Folder not found | Double-check `PARENT_FOLDER_ID` in `Code.gs` |
| Permission denied | Re-authorize in script editor → Run any function |
| Old code still running | Deploy → Manage → Edit → New version → Deploy |
