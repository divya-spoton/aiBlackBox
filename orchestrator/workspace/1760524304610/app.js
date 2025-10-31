document.addEventListener('DOMContentLoaded', () => {
  listenToFolders();
  listenToNotes();
});

async function addFolder() {
  const folderName = document.getElementById('newFolderName').value.trim();
  if (!folderName) return;

  try {
    await db.collection(`${PROJECT_NAMESPACE}/collections/folders`).add({
      name: folderName,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('newFolderName').value = '';
  } catch (error) {
    console.error('Error adding folder:', error);
    alert('Failed to add folder');
  }
}

function listenToFolders() {
  // Real-time listener for folders is now in index.html
}

async function addNote() {
  const title = document.getElementById('newNoteTitle').value.trim();
  const content = document.getElementById('newNoteContent').value.trim();
  const tags = document.getElementById('newNoteTags').value.trim().split(',').map(tag => tag.trim());
  const folderId = document.getElementById('folderSelect').value;

  if (!title || !folderId) return;

  try {
    await db.collection(`${PROJECT_NAMESPACE}/collections/notes`).add({
      title: title,
      content: content,
      tags: tags,
      folderId: folderId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('newNoteTitle').value = '';
    document.getElementById('newNoteContent').value = '';
    document.getElementById('newNoteTags').value = '';
  } catch (error) {
    console.error('Error adding note:', error);
    alert('Failed to add note');
  }
}

function listenToNotes() {
  // Real-time listener for notes is now in index.html
}