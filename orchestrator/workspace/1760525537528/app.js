document.addEventListener('DOMContentLoaded', () => {
    listenToFolders();
    listenToNotes();
});

async function addFolder() {
    const folderName = document.getElementById('newFolderName').value.trim();
    if (folderName === '') return;
    try {
        await db.collection(`${PROJECT_NAMESPACE}/folders`).add({
            name: folderName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error adding folder:', error);
        alert('Failed to add folder');
    }
}

function listenToFolders() {
    db.collection(`${PROJECT_NAMESPACE}/folders`).onSnapshot(snapshot => {
        const folderList = document.getElementById('folderList');
        const folderSelect = document.getElementById('folderSelect');
        folderList.innerHTML = '';
        folderSelect.innerHTML = '<option value="">Select Folder</option>';
        snapshot.forEach(doc => {
            const folder = doc.data();
            const listItem = document.createElement('li');
            listItem.textContent = folder.name;
            folderList.appendChild(listItem);

            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = folder.name;
            folderSelect.appendChild(option);
        });
    }, error => {
        console.error('Error listening to folders:', error);
    });
}

async function addNote() {
    const title = document.getElementById('newNoteTitle').value.trim();
    const content = document.getElementById('newNoteContent').value.trim();
    const tags = document.getElementById('newNoteTags').value.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
    const folderId = document.getElementById('folderSelect').value;
    if (title === '' || content === '' || folderId === '') return;
    try {
        await db.collection(`${PROJECT_NAMESPACE}/notes`).add({
            title: title,
            content: content,
            tags: tags,
            folderId: folderId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error adding note:', error);
        alert('Failed to add note');
    }
}

function listenToNotes() {
    db.collection(`${PROJECT_NAMESPACE}/notes`).orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        const noteList = document.getElementById('noteList');
        noteList.innerHTML = '';
        snapshot.forEach(doc => {
            const note = doc.data();
            const listItem = document.createElement('li');
            listItem.textContent = `${note.title} - ${note.tags.join(', ')}`;
            noteList.appendChild(listItem);
        });
    }, error => {
        console.error('Error listening to notes:', error);
    });
}