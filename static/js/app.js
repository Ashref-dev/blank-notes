// Global app state
let currentNoteId = null;
let notes = {};
let isPageSelectorOpen = false;
let isMoreOptionsOpen = false;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeTheme();
    setupEventListeners();
    setupKeyboardShortcuts();
    loadNotesFromStorage();
    loadCurrentNote();
    updateSidebar();
    
    // Ensure word count is updated on initial load
    setTimeout(() => {
        const textarea = document.getElementById('main-textarea');
        if (textarea && textarea.value) {
            updateWordCount(textarea.value);
        } else {
            updateWordCount('');
        }
    }, 100);
});

// Handle browser navigation (back/forward buttons)
window.addEventListener('popstate', function(event) {
    loadCurrentNote();
});

// Theme management
function toggleTheme() {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.documentElement.classList.add('dark');
    }
}

// Local Storage Management
function loadNotesFromStorage() {
    const stored = localStorage.getItem('blankpage_notes');
    if (stored) {
        try {
            notes = JSON.parse(stored);
        } catch (e) {
            console.error('Error loading notes from storage:', e);
            notes = {};
        }
    } else {
        notes = {};
    }
}

function saveNotesToStorage() {
    try {
        localStorage.setItem('blankpage_notes', JSON.stringify(notes));
    } catch (e) {
        console.error('Error saving notes to storage:', e);
    }
}

function generateNoteId() {
    return 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function getAllNotes() {
    return Object.keys(notes).map(id => notes[id]);
}

function handleTextareaInput(content) {
    // Ensure we have a current note
    if (!currentNoteId) {
        // Try to get note ID from URL first
        const urlParams = new URLSearchParams(window.location.search);
        const noteIdFromUrl = urlParams.get('note');
        
        if (noteIdFromUrl && notes[noteIdFromUrl]) {
            currentNoteId = noteIdFromUrl;
        } else {
            currentNoteId = generateNoteId();
        }
    }
    
    // Save to localStorage immediately
    saveToLocalStorage(content);
    
    // Update UI
    updateWordCount(content);
    updatePageTitle(content);
}

function saveToLocalStorage(content) {
    // Ensure we have a note ID - this should never be empty if loadCurrentNote worked properly
    if (!currentNoteId) {
        console.warn('No currentNoteId found during save, creating new note');
        currentNoteId = generateNoteId();
    }
    
    const title = getNoteTitleFromContent(content);
    const now = new Date().toISOString();
    
    // Create or update note
    if (!notes[currentNoteId]) {
        // Creating a new note
        notes[currentNoteId] = {
            id: currentNoteId,
            title: title,
            content: content,
            createdAt: now,
            updatedAt: now
        };
    } else {
        // Updating existing note
        notes[currentNoteId] = {
            ...notes[currentNoteId],
            title: title,
            content: content,
            updatedAt: now
        };
    }
    
    saveNotesToStorage();
    
    // Save the current note ID as the last edited note for better UX
    localStorage.setItem('blankpage_last_note', currentNoteId);
    console.log('saveToLocalStorage: Saved last note ID:', currentNoteId);
    
    updateSidebar();
    updatePageTitle(content);
    
    // Ensure URL is always in sync with current note
    const urlParams = new URLSearchParams(window.location.search);
    const currentUrlNoteId = urlParams.get('note');
    if (currentUrlNoteId !== currentNoteId) {
        updateUrlForNote(currentNoteId);
    }
}

function loadCurrentNote() {
    loadNotesFromStorage();
    
    // Check if we have any notes at all
    const allNotes = getAllNotes();
    console.log('loadCurrentNote: Found', allNotes.length, 'notes');
    
    if (allNotes.length === 0) {
        console.log('loadCurrentNote: No notes found, creating first note');
        createFirstNote();
        return;
    }

    // First check URL for note parameter
    const urlParams = new URLSearchParams(window.location.search);
    const noteIdFromUrl = urlParams.get('note');
    console.log('loadCurrentNote: Note ID from URL:', noteIdFromUrl);
    
    if (noteIdFromUrl && notes[noteIdFromUrl]) {
        // Valid note ID in URL - load that specific note
        console.log('loadCurrentNote: Loading note from URL:', noteIdFromUrl);
        currentNoteId = noteIdFromUrl;
        loadNoteIntoEditor(notes[currentNoteId]);
        updateSidebar();
        return;
    }

    // No valid note in URL - check for last edited note
    const lastNoteId = localStorage.getItem('blankpage_last_note');
    console.log('loadCurrentNote: Last edited note ID from localStorage:', lastNoteId);
    
    if (lastNoteId && notes[lastNoteId]) {
        // Load the last edited note for better UX
        console.log('loadCurrentNote: Loading last edited note:', lastNoteId);
        currentNoteId = lastNoteId;
        loadNoteIntoEditor(notes[currentNoteId]);
        updateUrlForNote(currentNoteId);
        updateSidebar();
        return;
    }

    // Fall back to most recent note
    if (allNotes.length > 0) {
        // Sort by updatedAt to get the most recent
        const sortedNotes = allNotes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        const mostRecentNote = sortedNotes[0];
        console.log('loadCurrentNote: Falling back to most recent note:', mostRecentNote.id);
        currentNoteId = mostRecentNote.id;
        
        // Load the note into editor
        loadNoteIntoEditor(mostRecentNote);
        
        // IMPORTANT: Update URL to include the note ID so we can resume properly
        updateUrlForNote(currentNoteId);
        updateSidebar();
    }
}

function getNoteTitleFromContent(content) {
    if (!content || content.trim() === '') return 'Untitled';
    
    const firstLine = content.split('\n')[0].trim();
    if (firstLine.length === 0) return 'Untitled';
    
    return firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine;
}

function createFirstNote() {
    currentNoteId = generateNoteId();
    const defaultContent = 'Welcome to blank.ashref.tn\n\nStart typing to create your first note...';
    
    const note = {
        id: currentNoteId,
        title: 'Welcome to blank.ashref.tn',
        content: defaultContent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    notes[currentNoteId] = note;
    saveNotesToStorage();
    loadNoteIntoEditor(note);
    updateUrlForNote(currentNoteId);
    updateSidebar();
}

function loadNoteIntoEditor(note) {
    const textarea = document.getElementById('main-textarea');
    if (textarea) {
        textarea.value = note.content || '';
        updateWordCount(note.content || '');
        updatePageTitle(note.content || '');
        textarea.focus();
    }
}

function updateUrlForNote(noteId) {
    const url = new URL(window.location);
    url.searchParams.set('note', noteId);
    window.history.replaceState({}, '', url);
}

function createNewNote() {
    currentNoteId = generateNoteId();
    
    // Create new note object
    const now = new Date().toISOString();
    const newNote = {
        id: currentNoteId,
        title: 'Untitled',
        content: '',
        createdAt: now,
        updatedAt: now
    };
    
    notes[currentNoteId] = newNote;
    saveNotesToStorage();
    
    // Load the new note into editor
    loadNoteIntoEditor(newNote);
    
    // Update URL and sidebar
    updateUrlForNote(currentNoteId);
    updateSidebar();
}

function switchToNote(noteId) {
    if (!notes[noteId]) return;
    
    currentNoteId = noteId;
    const note = notes[noteId];
    
    // Load note into editor
    loadNoteIntoEditor(note);
    
    // Update URL without page reload
    updateUrlForNote(noteId);
    
    // Update sidebar to highlight active note
    updateSidebar();
    
    closePageSelector();
}

function deleteNote(noteId) {
    if (!noteId || !notes[noteId]) return;
    
    if (confirm('Are you sure you want to delete this note?')) {
        delete notes[noteId];
        saveNotesToStorage();
        
        // If we're deleting the current note, create a new one
        if (currentNoteId === noteId) {
            const remainingNotes = Object.keys(notes);
            if (remainingNotes.length > 0) {
                const latestNote = remainingNotes
                    .map(id => notes[id])
                    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
                switchToNote(latestNote.id);
            } else {
                createNewNote();
            }
        }
        
        updateSidebar();
    }
}

function updateSidebar() {
    const pageList = document.getElementById('page-list');
    if (!pageList) return;
    
    const noteIds = Object.keys(notes);
    if (noteIds.length === 0) {
        pageList.innerHTML = '<div class="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">No notes yet</div>';
        return;
    }
    
    const sortedNotes = noteIds
        .map(id => notes[id])
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    
    const html = sortedNotes.map(note => {
        const isActive = note.id === currentNoteId;
        const date = new Date(note.updatedAt).toLocaleDateString();
        
        return `
            <div class="flex items-center justify-between px-4 py-3 hover:bg-mauve-50 dark:hover:bg-mauve-900/20 cursor-pointer transition-all duration-200 ${isActive ? 'bg-mauve-50 dark:bg-mauve-900/20 border-r-2 border-mauve-500' : ''}"
                 onclick="switchToNote('${note.id}')">
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900 dark:text-white truncate">
                        ${note.title}
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">
                        ${date}
                    </div>
                </div>
                <button onclick="event.stopPropagation(); deleteNote('${note.id}')" 
                        class="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            </div>
        `;
    }).join('');
    
    pageList.innerHTML = html;
    
    // Update current page title in nav
    if (currentNoteId && notes[currentNoteId]) {
        const titleElement = document.getElementById('current-page-title');
        if (titleElement) {
            const title = notes[currentNoteId].title;
            titleElement.textContent = title.length > 20 ? title.substring(0, 20) + '...' : title;
        }
    }
}
// Page selector functionality
function togglePageSelector() {
    const dropdown = document.getElementById('page-dropdown');
    const isOpen = !dropdown.classList.contains('hidden');
    
    if (isOpen) {
        closePageSelector();
    } else {
        openPageSelector();
    }
}

function openPageSelector() {
    const dropdown = document.getElementById('page-dropdown');
    dropdown.classList.remove('hidden');
    isPageSelectorOpen = true;
    updateSidebar();
}

function closePageSelector() {
    const dropdown = document.getElementById('page-dropdown');
    dropdown.classList.add('hidden');
    isPageSelectorOpen = false;
}

// More options functionality
function toggleMoreOptions() {
    const dropdown = document.getElementById('more-options');
    const isOpen = !dropdown.classList.contains('hidden');
    
    if (isOpen) {
        closeMoreOptions();
    } else {
        openMoreOptions();
    }
}

function openMoreOptions() {
    const dropdown = document.getElementById('more-options');
    dropdown.classList.remove('hidden');
    isMoreOptionsOpen = true;
}

function closeMoreOptions() {
    const dropdown = document.getElementById('more-options');
    dropdown.classList.add('hidden');
    isMoreOptionsOpen = false;
}

// Word count functionality
function updateWordCount(content) {
    if (!content) content = '';
    
    // Count words more accurately
    const trimmed = content.trim();
    const words = trimmed === '' ? 0 : trimmed.split(/\s+/).filter(word => word.length > 0).length;
    const chars = content.length;
    const charsNoSpaces = content.replace(/\s/g, '').length;
    
    const wordCountElement = document.getElementById('word-count');
    if (wordCountElement) {
        wordCountElement.textContent = `${words} words, ${chars} chars`;
    }
    
    // Also log for debugging
    console.log(`Word count updated: ${words} words, ${chars} chars`);
}

// Page title functionality
function updatePageTitle(content) {
    const title = getNoteTitleFromContent(content);
    
    const titleElement = document.getElementById('current-page-title');
    if (titleElement) {
        titleElement.textContent = title.length > 20 ? title.substring(0, 20) + '...' : title;
    }
    
    // Update browser title
    document.title = title === 'Untitled' ? 'Blank.page' : `${title} - Blank.page`;
}

// Share functionality
function shareCurrentNote() {
    if (!currentNoteId || !notes[currentNoteId]) {
        alert('Please create a note first');
        return;
    }
    
    const note = notes[currentNoteId];
    
    // Show sharing modal with options
    const modal = document.getElementById('share-modal');
    const content = document.getElementById('share-content');
    
    content.innerHTML = `
        <div class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Share publicly for:
                </label>
                <select id="share-expiry" class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
                    <option value="1">1 hour</option>
                    <option value="24">24 hours</option>
                    <option value="168" selected>7 days</option>
                    <option value="720">30 days</option>
                    <option value="0">Never expires</option>
                </select>
            </div>
            <div class="flex gap-2">
                <button 
                    onclick="createShareLink()" 
                    class="flex-1 bg-mauve-600 hover:bg-mauve-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:shadow-lg hover:shadow-mauve-500/25">
                    Create Share Link
                </button>
                <button 
                    onclick="copyNoteContent()" 
                    class="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-mauve-50 dark:hover:bg-mauve-900/20 hover:border-mauve-300 dark:hover:border-mauve-600 rounded-lg transition-all duration-200">
                    Copy Text
                </button>
            </div>
            <div id="share-result" class="hidden">
                <!-- Share result will appear here -->
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
}

async function createShareLink() {
    if (!currentNoteId || !notes[currentNoteId]) return;
    
    const note = notes[currentNoteId];
    const expiryHours = parseInt(document.getElementById('share-expiry').value);
    
    try {
        const response = await fetch('/api/share', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: note.title,
                content: note.content,
                expiryHours: expiryHours
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            const shareUrl = `${window.location.origin}/shared/${result.shareId}`;
            const resultDiv = document.getElementById('share-result');
            
            resultDiv.innerHTML = `
                <div class="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <p class="text-sm text-green-800 dark:text-green-200 mb-2">Share link created successfully!</p>
                    <div class="flex gap-2">
                        <input 
                            type="text" 
                            value="${shareUrl}" 
                            readonly 
                            class="flex-1 p-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded"
                            id="share-url-input">
                        <button 
                            onclick="copyShareUrl()" 
                            class="px-3 py-2 bg-mauve-600 hover:bg-mauve-700 text-white rounded text-sm transition-all duration-200 hover:shadow-lg hover:shadow-mauve-500/25">
                            Copy
                        </button>
                    </div>
                    ${expiryHours > 0 ? `<p class="text-xs text-gray-600 dark:text-gray-400 mt-2">Expires in ${expiryHours} hours</p>` : '<p class="text-xs text-gray-600 dark:text-gray-400 mt-2">Never expires</p>'}
                </div>
            `;
            
            resultDiv.classList.remove('hidden');
        } else {
            throw new Error(result.error || 'Failed to create share link');
        }
    } catch (error) {
        console.error('Error creating share link:', error);
        const resultDiv = document.getElementById('share-result');
        resultDiv.innerHTML = `
            <div class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p class="text-sm text-red-800 dark:text-red-200">Failed to create share link. Please try again.</p>
            </div>
        `;
        resultDiv.classList.remove('hidden');
    }
}

function copyShareUrl() {
    const input = document.getElementById('share-url-input');
    input.select();
    document.execCommand('copy');
    showToast('Share link copied to clipboard');
}

function copyNoteContent() {
    if (!currentNoteId || !notes[currentNoteId]) return;
    
    const content = notes[currentNoteId].content;
    navigator.clipboard.writeText(content).then(() => {
        showToast('Note content copied to clipboard');
        closeShareModal();
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = content;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('Note content copied to clipboard');
        closeShareModal();
    });
}

function openShareModal() {
    const modal = document.getElementById('share-modal');
    modal.classList.remove('hidden');
}

function closeShareModal() {
    const modal = document.getElementById('share-modal');
    modal.classList.add('hidden');
}

// About modal functions
function showAboutModal() {
    const modal = document.getElementById('about-modal');
    modal.classList.remove('hidden');
    closeMoreOptions(); // Close the menu when opening modal
}

function closeAboutModal() {
    const modal = document.getElementById('about-modal');
    modal.classList.add('hidden');
}

// Copy functionality
function copyNoteContent() {
    if (!currentNoteId || !notes[currentNoteId]) {
        showToast('No note to copy', 'error');
        return;
    }
    
    const content = notes[currentNoteId].content || '';
    if (content.trim() === '') {
        showToast('Note is empty', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(content).then(() => {
        showToast('Note content copied to clipboard');
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = content;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('Note content copied to clipboard');
    });
}

function copyCurrentUrl() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        showToast('URL copied to clipboard');
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('URL copied to clipboard');
    });
}

// Upload functionality (placeholder)
function uploadFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md,.doc,.docx';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const content = e.target.result;
                const textarea = document.querySelector('textarea[name="content"]');
                if (textarea) {
                    textarea.value = content;
                    updateWordCount(content);
                    updatePageTitle(content);
                    
                    // Trigger save
                    textarea.dispatchEvent(new Event('input'));
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
}

// Download functionality
async function downloadNote(format) {
    if (!currentNoteId || !notes[currentNoteId]) {
        alert('Please create a note first');
        return;
    }
    
    const note = notes[currentNoteId];
    
    try {
        // First, save the note to backend to get a proper UUID
        const response = await fetch('/api/share', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: note.title,
                content: note.content,
                expiryHours: 1 // Short expiry for download purposes
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            // Extract noteId from the share response - we need to get it from the backend
            // For now, let's use client-side download as fallback
            clientSideDownload(note, format);
        } else {
            // Fallback to client-side download
            clientSideDownload(note, format);
        }
    } catch (error) {
        console.error('Download error:', error);
        // Fallback to client-side download
        clientSideDownload(note, format);
    }
    
    closeMoreOptions();
}

function clientSideDownload(note, format) {
    const content = note.content;
    const filename = `${note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${format}`;
    
    const blob = new Blob([content], { 
        type: format === 'md' ? 'text/markdown' : 'text/plain' 
    });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
}

// Print functionality
function printNote() {
    window.print();
    closeMoreOptions();
}

// Delete functionality
function deleteCurrentNote() {
    if (!currentNoteId) {
        alert('No note selected');
        return;
    }
    
    deleteNote(currentNoteId);
    closeMoreOptions();
}

// Toast notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg z-50 transition-all duration-300 transform translate-y-0 opacity-100 font-sans text-sm';
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    
    // Initially position off screen
    toast.style.transform = 'translateY(100px)';
    toast.style.opacity = '0';
    
    document.body.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
    });
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.transform = 'translateY(100px)';
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast.parentNode) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// Event listeners
function setupEventListeners() {
    // Close dropdowns when clicking outside
    document.addEventListener('click', function(event) {
        const pageSelector = document.getElementById('page-selector');
        const pageDropdown = document.getElementById('page-dropdown');
        const moreOptions = document.getElementById('more-options');
        
        // Close page selector if clicking outside
        if (isPageSelectorOpen && !pageSelector.contains(event.target) && !pageDropdown.contains(event.target)) {
            closePageSelector();
        }
        
        // Close more options if clicking outside
        if (isMoreOptionsOpen && !event.target.closest('.relative')) {
            closeMoreOptions();
        }
    });
    
    // Handle escape key
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closePageSelector();
            closeMoreOptions();
            closeShareModal();
            closeAboutModal();
        }
    });
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + N: New note
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            createNewNote();
        }
        
        // Ctrl/Cmd + S: Save (already handled by auto-save, but prevent browser save)
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
        }
        
        // Ctrl/Cmd + D: Toggle dark mode
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            toggleTheme();
        }
        
        // Ctrl/Cmd + K: Open page selector
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            togglePageSelector();
        }
        
        // Ctrl/Cmd + Shift + S: Share
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
            e.preventDefault();
            shareCurrentNote();
        }
    });
}

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Export functions for global use
window.toggleTheme = toggleTheme;
window.togglePageSelector = togglePageSelector;
window.closePageSelector = closePageSelector;
window.switchToNote = switchToNote;
window.deleteNote = deleteNote;
window.createNewNote = createNewNote;
window.toggleMoreOptions = toggleMoreOptions;
window.closeMoreOptions = closeMoreOptions;
window.updateWordCount = updateWordCount;
window.updatePageTitle = updatePageTitle;
window.saveToLocalStorage = saveToLocalStorage;
window.shareCurrentNote = shareCurrentNote;
window.createShareLink = createShareLink;
window.copyShareUrl = copyShareUrl;
window.copyNoteContent = copyNoteContent;
window.closeShareModal = closeShareModal;
window.copyCurrentUrl = copyCurrentUrl;
window.uploadFile = uploadFile;
window.downloadNote = downloadNote;
window.printNote = printNote;
window.deleteCurrentNote = deleteCurrentNote;
window.showAboutModal = showAboutModal;
window.closeAboutModal = closeAboutModal;

