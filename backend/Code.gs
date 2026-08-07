// ============================================================
//  Proquoment Supplier Application — Google Apps Script API
//  Replaces: Supabase Edge Function + Supabase Storage
//  Data stored in: proquoment@gmail.com Google Drive + Sheets
// ============================================================
//
//  SETUP (run once):
//  1. Fill in SHEET_ID and PARENT_FOLDER_ID below
//  2. Run setupSheetHeaders() once from the editor
//  3. Deploy → New Deployment → Web App
//     → Execute as: Me (proquoment@gmail.com)
//     → Who has access: Anyone
//  4. Copy the Web App URL into index.html CONFIG.APPS_SCRIPT_URL
// ============================================================

const CONFIG = {
  // Paste your Google Sheet ID here (from the URL: /d/SHEET_ID/edit)
  SHEET_ID: '1r1UlAQjr0PUW5QtVMA287wKBQ0l9uyhZInGdb1qfYkI',

  // Paste the ID of your "Proquoment Suppliers" Drive folder
  // (from the URL: /drive/folders/FOLDER_ID)
  PARENT_FOLDER_ID: '1tx6cdF6_iZrBCJt_wkfTRz0ADAxou4Eg',

  // Tab name inside the spreadsheet
  SHEET_NAME: 'Submissions',

  // Maximum individual file size (50 MB)
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024,

  // Allowed MIME types — executables and scripts are rejected
  ALLOWED_MIME_TYPES: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'video/mp4'
  ]
};

// ============================================================
//  ENTRY POINTS
// ============================================================

/**
 * Handles POST requests from the supplier form.
 * Expects JSON body with text fields + base64-encoded files.
 */
function doPost(e) {
  try {
    // Parse JSON body
    const raw = (e && e.postData) ? e.postData.contents : '{}';
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return respond({ error: 'Invalid JSON payload' });
    }

    // Server-side field validation
    const validation = validatePayload(data);
    if (!validation.ok) {
      return respond({ error: validation.error });
    }

    // Duplicate detection (email OR company name)
    if (checkDuplicate(data.email_primary, data.factory_name)) {
      return respond({ duplicate: true, message: 'A submission with this email or company name already exists.' });
    }

    // Timestamps and naming
    const now    = new Date();
    const tz     = 'Asia/Kolkata';
    const dateStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    const prefix  = Utilities.formatDate(now, tz, 'yyyyMMdd_HHmmss');

    // Create supplier folder inside "Proquoment Suppliers"
    const safeCompany = sanitizeCompanyName(data.factory_name);
    const folderName  = safeCompany + ' - ' + dateStr;
    const folderResult = createSupplierFolder(folderName);

    // Upload catalog file (single)
    let catalogResult = null;
    if (data.catalog_file && data.catalog_file.base64) {
      try {
        catalogResult = uploadFileToDrive(data.catalog_file, folderResult.folder, prefix);
      } catch (uploadErr) {
        Logger.log('Catalog upload error: ' + uploadErr);
      }
    }

    // Upload photo/document files (multiple)
    const photoResults = [];
    if (data.photo_files && Array.isArray(data.photo_files)) {
      for (const fileData of data.photo_files) {
        try {
          const result = uploadFileToDrive(fileData, folderResult.folder, prefix);
          if (result) photoResults.push(result);
        } catch (uploadErr) {
          Logger.log('Photo upload error: ' + uploadErr);
        }
      }
    }

    const totalFiles = (catalogResult ? 1 : 0) + photoResults.length;

    // Build spreadsheet row
    const submissionId = Utilities.getUuid();
    const timestamp    = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss');
    const row          = buildRow(submissionId, timestamp, data, folderResult, catalogResult, photoResults, totalFiles);

    // Append to Google Sheet
    appendToSheet(row);

    Logger.log('✅ Submission saved: ' + submissionId + ' | Company: ' + data.factory_name);
    return respond({ ok: true, submissionId: submissionId });

  } catch (err) {
    Logger.log('❌ Fatal error in doPost: ' + err.toString());
    return respond({ error: 'Server error. Please try again or email hello@proquoment.in' });
  }
}

/**
 * Health check — confirms the API is running.
 */
function doGet(e) {
  return respond({ status: 'Proquoment Supplier API is running', version: '2.0.0' });
}

// ============================================================
//  VALIDATION
// ============================================================

function validatePayload(data) {
  const required = [
    'factory_name', 'year_established', 'address_line_1', 'city',
    'state_province', 'postal_code', 'country', 'num_employees',
    'production_capacity', 'main_product_categories', 'export_markets',
    'materials_specialized', 'certifications', 'accepted_payment_method',
    'primary_contact_name', 'primary_contact_role',
    'email_primary', 'whatsapp_primary', 'website_url', 'previous_clients'
  ];

  for (const field of required) {
    const val = data[field];
    if (val === undefined || val === null || String(val).trim() === '') {
      return { ok: false, error: 'Missing required field: ' + field };
    }
  }

  // Basic email format check
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(String(data.email_primary).trim())) {
    return { ok: false, error: 'Invalid email address format' };
  }

  return { ok: true };
}

// ============================================================
//  DUPLICATE DETECTION
// ============================================================

function checkDuplicate(email, companyName) {
  try {
    const sheet   = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return false; // only headers or empty sheet

    // Column indices (1-indexed):
    // C = 3  → Factory Name
    // AA = 27 → Email Primary
    const dataRows = lastRow - 1;
    const emails    = sheet.getRange(2, 27, dataRows, 1).getValues();
    const companies = sheet.getRange(2, 3,  dataRows, 1).getValues();

    const normEmail   = String(email).toLowerCase().trim();
    const normCompany = String(companyName).toLowerCase().trim();

    for (let i = 0; i < dataRows; i++) {
      if (String(emails[i][0]).toLowerCase().trim()    === normEmail)   return true;
      if (String(companies[i][0]).toLowerCase().trim() === normCompany) return true;
    }
    return false;

  } catch (err) {
    // Fail open — allow submission if sheet check errors
    Logger.log('Duplicate check error (failing open): ' + err);
    return false;
  }
}

// ============================================================
//  GOOGLE DRIVE OPERATIONS
// ============================================================

/**
 * Creates a supplier subfolder under the Proquoment Suppliers parent folder.
 * Sets "anyone with link can view" permissions.
 */
function createSupplierFolder(folderName) {
  const parent = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
  const folder  = parent.createFolder(folderName);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    folder: folder,
    url:    folder.getUrl(),
    id:     folder.getId()
  };
}

/**
 * Decodes a base64-encoded file and uploads it to a Drive folder.
 * Returns { url, id, name } or null if rejected.
 *
 * @param {Object} fileData  - { base64, name, mimeType, size }
 * @param {Folder} folder    - Drive Folder object
 * @param {string} prefix    - Timestamp prefix e.g. "20260808_003000"
 */
function uploadFileToDrive(fileData, folder, prefix) {
  if (!fileData || !fileData.base64 || !fileData.name || !fileData.mimeType) {
    Logger.log('Skipping invalid file data object');
    return null;
  }

  // Reject disallowed MIME types
  if (!CONFIG.ALLOWED_MIME_TYPES.includes(fileData.mimeType)) {
    Logger.log('Rejected MIME type: ' + fileData.mimeType + ' | File: ' + fileData.name);
    return null;
  }

  // Decode bytes and validate size
  const bytes = Utilities.base64Decode(fileData.base64);
  if (bytes.length > CONFIG.MAX_FILE_SIZE_BYTES) {
    Logger.log('Rejected oversized file: ' + bytes.length + ' bytes | ' + fileData.name);
    return null;
  }

  // Sanitize filename, prefix with timestamp to avoid collisions
  const safeName = prefix + '_' + fileData.name.replace(/[^\w.\-]/g, '_');

  // Create Drive file and set sharing
  const blob = Utilities.newBlob(bytes, fileData.mimeType, safeName);
  const file  = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  Logger.log('📎 Uploaded: ' + safeName + ' (' + bytes.length + ' bytes)');

  return {
    url:  'https://drive.google.com/file/d/' + file.getId() + '/view?usp=sharing',
    id:   file.getId(),
    name: safeName
  };
}

// ============================================================
//  GOOGLE SHEETS OPERATIONS
// ============================================================

/**
 * Builds the spreadsheet row array matching the defined column order.
 */
function buildRow(submissionId, timestamp, data, folderResult, catalogResult, photoResults, totalFiles) {
  return [
    submissionId,                                            // A  Submission ID
    timestamp,                                               // B  Submission Timestamp
    data.factory_name            || '',                      // C  Factory Name
    data.year_established        || '',                      // D  Year Established
    data.address_line_1          || '',                      // E  Address Line 1
    data.address_line_2          || '',                      // F  Address Line 2
    data.city                    || '',                      // G  City
    data.state_province          || '',                      // H  State / Province
    data.postal_code             || '',                      // I  Postal Code
    data.country                 || '',                      // J  Country
    data.factory_size_sqm        || '',                      // K  Factory Size (m²)
    data.num_employees           || '',                      // L  Number of Employees
    data.production_capacity     || '',                      // M  Production Capacity
    data.main_product_categories || '',                      // N  Main Product Categories
    data.export_markets          || '',                      // O  Export Markets
    data.materials_specialized   || '',                      // P  Materials Specialized
    data.moq                     || '',                      // Q  MOQ
    data.sample_lead_time        || '',                      // R  Sample Lead Time
    data.bulk_lead_time          || '',                      // S  Bulk Lead Time
    data.certifications          || '',                      // T  Certifications
    data.preferred_payment_terms || '',                      // U  Preferred Payment Terms
    data.accepted_payment_method || '',                      // V  Accepted Payment Method
    data.primary_contact_name    || '',                      // W  Primary Contact Name
    data.primary_contact_role    || '',                      // X  Primary Contact Role
    data.secondary_contact_name  || '',                      // Y  Secondary Contact Name
    data.secondary_contact_role  || '',                      // Z  Secondary Contact Role
    data.email_primary           || '',                      // AA Email Primary
    data.email_secondary         || '',                      // AB Email Secondary
    data.whatsapp_primary        || '',                      // AC WhatsApp Primary
    data.whatsapp_secondary      || '',                      // AD WhatsApp Secondary
    data.wechat_primary          || '',                      // AE WeChat Primary
    data.wechat_secondary        || '',                      // AF WeChat Secondary
    data.website_url             || '',                      // AG Website URL
    data.previous_clients        || '',                      // AH Previous Clients
    folderResult.url,                                        // AI Supplier Folder URL
    folderResult.id,                                         // AJ Supplier Folder ID
    catalogResult ? catalogResult.url : '',                  // AK Catalog File URL
    catalogResult ? catalogResult.id  : '',                  // AL Catalog File ID
    photoResults.map(function(r) { return r.url; }).join('\n'),  // AM Photo URLs
    photoResults.map(function(r) { return r.id;  }).join(', '), // AN Photo IDs
    totalFiles,                                              // AO Total Files Uploaded
    data.source || 'proquoment.in',                          // AP Source
    'Pending',                                               // AQ Verification Status
    'Not Reviewed'                                           // AR AI Review Status
  ];
}

/**
 * Appends a row to the Submissions sheet.
 */
function appendToSheet(rowData) {
  const ss    = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + CONFIG.SHEET_NAME + '" not found. Run setupSheetHeaders() first.');
  sheet.appendRow(rowData);
  SpreadsheetApp.flush();
}

// ============================================================
//  UTILITIES
// ============================================================

function sanitizeCompanyName(name) {
  return String(name).replace(/[\/\\:*?"<>|]/g, '').trim().substring(0, 60);
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
//  ONE-TIME SETUP: Run this manually once from the editor
//  Extensions → Apps Script → select setupSheetHeaders → Run
// ============================================================

function setupSheetHeaders() {
  const ss    = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet   = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET_NAME);

  const headers = [
    'Submission ID',          // A
    'Submission Timestamp',   // B
    'Factory Name',           // C
    'Year Established',       // D
    'Address Line 1',         // E
    'Address Line 2',         // F
    'City',                   // G
    'State / Province',       // H
    'Postal Code',            // I
    'Country',                // J
    'Factory Size (m²)',      // K
    'Number of Employees',    // L
    'Production Capacity',    // M
    'Main Product Categories',// N
    'Export Markets',         // O
    'Materials Specialized',  // P
    'MOQ',                    // Q
    'Sample Lead Time',       // R
    'Bulk Lead Time',         // S
    'Certifications',         // T
    'Preferred Payment Terms',// U
    'Accepted Payment Method',// V
    'Primary Contact Name',   // W
    'Primary Contact Role',   // X
    'Secondary Contact Name', // Y
    'Secondary Contact Role', // Z
    'Email Primary',          // AA
    'Email Secondary',        // AB
    'WhatsApp Primary',       // AC
    'WhatsApp Secondary',     // AD
    'WeChat Primary',         // AE
    'WeChat Secondary',       // AF
    'Website URL',            // AG
    'Previous Clients',       // AH
    'Supplier Folder URL',    // AI
    'Supplier Folder ID',     // AJ
    'Catalog File URL',       // AK
    'Catalog File ID',        // AL
    'Photo URLs',             // AM
    'Photo IDs',              // AN
    'Total Files Uploaded',   // AO
    'Source',                 // AP
    'Verification Status',    // AQ
    'AI Review Status'        // AR
  ];

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1a73e8');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontSize(11);

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);

  // Set column AM (Photo URLs) to wrap text
  sheet.getRange(1, 39, sheet.getMaxRows(), 1).setWrap(true);

  SpreadsheetApp.flush();
  Logger.log('✅ Sheet headers created. ' + headers.length + ' columns. Ready for submissions.');
  return '✅ Done — ' + headers.length + ' headers created.';
}
