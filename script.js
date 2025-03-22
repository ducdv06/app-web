// Configuration
const config = {
  region: "ap-southeast-2",
  bucketName: "dovanduc",
  accessKeyId: "AKIAQGH7D3ZY3YL6LNOU",
  secretAccessKey: "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",
};

// Initialize AWS SDK
AWS.config.update({
  region: config.region,
  credentials: new AWS.Credentials({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  }),
});

const s3 = new AWS.S3();


// DOM Elements
const uploadForm = document.getElementById("upload-form");
const fileInput = document.getElementById("file-upload");
const uploadButton = document.getElementById("upload-button");
const fileList = document.getElementById("file-list");
const toastContainer = document.getElementById("toast-container");

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  listFiles();
});

uploadForm.addEventListener("submit", handleFileUpload);
fileInput.addEventListener("change", updateUploadButton);

// Functions
function updateUploadButton() {
  uploadButton.disabled = !fileInput.files.length;
}

async function handleFileUpload(event) {
  event.preventDefault();

  const file = fileInput.files[0];
  if (!file) {
    showToast("No file selected", "Please select a file to upload", "destructive");
    return;
  }

  showUploadingState(true);

  try {
    const result = await uploadFile(file);

    if (result.success) {
      showToast("Upload Successful", result.message);
      fileInput.value = "";
      listFiles();
    } else {
      showToast("Upload Failed", result.error || "An error occurred during upload", "destructive");
    }
  } catch (error) {
    console.error("Error uploading file:", error);
    showToast("Upload Failed", "An unexpected error occurred", "destructive");
  } finally {
    showUploadingState(false);
  }
}

function showUploadingState(isUploading) {
  uploadButton.disabled = isUploading;

  if (isUploading) {
    uploadButton.innerHTML = `
      <span class="button-content">
        <span class="spinner"></span>
        Uploading...
      </span>
    `;
  } else {
    uploadButton.innerHTML = `
      <span class="button-content">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        Upload to S3
      </span>
    `;
  }
}

async function uploadFile(file) {
  try {
    const key = `${Date.now()}-${file.name}`;

    const params = {
      Bucket: config.bucketName,
      Key: key,
      Body: file,
      ContentType: file.type,
      ContentDisposition: "attachment", // always download the file when accessed
    };

    const result = await s3.upload(params).promise();

    return {
      success: true,
      key: result.Key,
      message: "File uploaded successfully",
    };
  } catch (error) {
    console.error("Error uploading file:", error);
    return {
      success: false,
      error: "Failed to upload file",
    };
  }
}

async function listFiles() {
  try {
    fileList.innerHTML = `
      <tr class="empty-state">
        <td colspan="5">Loading files...</td>
      </tr>
    `;

    const params = {
      Bucket: config.bucketName,
    };

    const data = await s3.listObjectsV2(params).promise();

    if (!data.Contents || data.Contents.length === 0) {
      fileList.innerHTML = `
        <tr class="empty-state">
          <td colspan="5">No files found. Upload a file to get started.</td>
        </tr>
      `;
      return;
    }

    const fileData = await Promise.all(
      data.Contents.map(async (item) => {
        let isPublic = false;

        try {
          const aclParams = {
            Bucket: config.bucketName,
            Key: item.Key,
          };

          const aclData = await s3.getObjectAcl(aclParams).promise();

          // Check if the object has public read access
          isPublic = aclData.Grants.some(
            (grant) =>
              grant.Grantee.URI === "http://acs.amazonaws.com/groups/global/AllUsers" && grant.Permission === "READ"
          );
        } catch (error) {
          console.error(`Error getting ACL for ${item.Key}:`, error);
        }

        // Generate permanent link
        const permanentLink = getPermanentLink(item.Key, isPublic);

        return {
          key: item.Key,
          size: item.Size,
          lastModified: item.LastModified,
          isPublic,
          permanentLink
        };
      })
    );

    renderFileList(fileData);
  } catch (error) {
    console.error("Error listing files:", error);
    fileList.innerHTML = `
      <tr class="empty-state">
        <td colspan="5">Error loading files. Please try again later.</td>
      </tr>
    `;
  }
}

// Generate permanent link for a file
function getPermanentLink(key, isPublic) {
  return `https://${config.bucketName}.s3.${config.region}.amazonaws.com/${encodeURIComponent(key)}`;
}

// Copy link to clipboard
function copyLinkToClipboard(link) {
  navigator.clipboard.writeText(link)
    .then(() => {
      showToast("Link Copied", "File link copied to clipboard");
    })
    .catch((error) => {
      console.error("Failed to copy link:", error);
      showToast("Copy Failed", "Failed to copy link to clipboard", "destructive");
    });
}

function renderFileList(files) {
  const fileRows = files
    .map((file) => {
      const fileName = file.key.split("-").slice(1).join("-");
      const fileSize = formatFileSize(file.size);
      const lastModified = new Date(file.lastModified).toLocaleString();
      const accessBadgeClass = file.isPublic ? "badge badge-default" : "badge badge-outline";

      return `
      <tr>
        <td>${fileName}</td>
        <td>${fileSize}</td>
        <td>${lastModified}</td>
        <td>
          <span class="${accessBadgeClass}">${file.isPublic ? "Public" : "Private"}</span>
        </td>
        <td class="actions">
          <button class="button button-outline" onclick="downloadFile('${file.key}')" title="Download file">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          <button class="button button-outline" onclick="changeFileAccess('${file.key}', ${!file.isPublic})" title="${
        file.isPublic ? "Make private" : "Make public"
      }">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${
                file.isPublic
                  ? '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>'
                  : '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>'
              }
            </svg>
          </button>
          <button class="button button-outline" onclick="copyLinkToClipboard('${file.permanentLink}')" title="Copy link">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="button button-outline" onclick="deleteFile('${file.key}')" title="Delete file">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6L18 19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
                <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>
           </svg>
          </button>
        </td>
      </tr>
    `;
    })
    .join("");

  fileList.innerHTML = fileRows;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function downloadFile(key) {
  try {
    const params = {
      Bucket: config.bucketName,
      Key: key,
      Expires: 300, // URL expires in 5 minutes
    };

    const signedUrl = await s3.getSignedUrlPromise("getObject", params);

    // Open the URL in a new tab
    window.open(signedUrl, "_blank");
  } catch (error) {
    console.error("Error generating download URL:", error);
    showToast("Download Failed", "Failed to generate download URL", "destructive");
  }
}

async function changeFileAccess(key, makePublic) {
  try {
    const params = {
      Bucket: config.bucketName,
      Key: key,
      ACL: makePublic ? "public-read" : "private",
    };

    await s3.putObjectAcl(params).promise();

    showToast("Access Changed", `File access changed to ${makePublic ? "public" : "private"}`);

    // Refresh the file list
    listFiles();
  } catch (error) {
    console.error("Error changing file access:", error);
    showToast("Failed to Change Access", "An error occurred", "destructive");
  }
}

function showToast(title, description, variant = "default") {
  const toastId = Math.random().toString(36).substring(2, 9);
  const toastElement = document.createElement("div");
  toastElement.id = `toast-${toastId}`;
  toastElement.className = `toast ${variant === "destructive" ? "toast-destructive" : ""}`;

  toastElement.innerHTML = `
    <div class="toast-title">${title}</div>
    ${description ? `<div class="toast-description">${description}</div>` : ""}
  `;

  toastContainer.appendChild(toastElement);

  setTimeout(() => {
    const toast = document.getElementById(`toast-${toastId}`);
    if (toast) {
      toast.remove();
    }
  }, 5000);
}

async function deleteFile(fileKey) {
  const confirmDelete = confirm("Are you sure you want to delete this file?");
  if (!confirmDelete) return;

  try {
    const params = {
      Bucket: config.bucketName,
      Key: fileKey,
    };

    await s3.deleteObject(params).promise();

    showToast("File Deleted", "The file was successfully deleted.");
    listFiles(); // Cập nhật danh sách file
  } catch (error) {
    console.error("Error deleting file:", error);
    showToast("Delete Failed", "An error occurred while deleting the file", "destructive");
  }
}



