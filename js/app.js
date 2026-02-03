document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const editorPane = document.getElementById('editor-pane');
    const editor = document.getElementById('yaml-editor');
    const timelineContainer = document.getElementById('timeline-visualization');
    const timelineTitle = document.getElementById('timeline-title');
    const errorMessage = document.getElementById('error-message');
    const btnNew = document.getElementById('btn-new');
    const btnLoad = document.getElementById('btn-load');
    const btnExport = document.getElementById('btn-export');
    const btnShare = document.getElementById('btn-share');
    const btnToggleEditor = document.getElementById('btn-toggle-editor');
    const btnLayoutToggle = document.getElementById('btn-layout-toggle');
    const fileInput = document.getElementById('file-input');
    const resizer = document.getElementById('drag-handle');
    const mainContent = document.querySelector('.main-content');

    // Default Template
    const defaultData =
        `# Timeline Data
meta:
  appVersion: "1.0.0"
  title: "My Timeline"

# Events List
# Format:
# - content: "Event Name"
#   start: "YYYY-MM-DD" or "YYYY-MM-DD HH:mm:ss"
#   end: "YYYY-MM-DD" (optional, makes it a range)
#   group: "Group Name" (optional)
#   type: "point", "range", or "background" (optional)
events:
  - content: "Initial Idea"
    start: "2024-01-01"
    type: "point"

  - content: "Development Phase"
    start: "2024-01-05"
    end: "2024-02-15"
    type: "range"

  - content: "Beta Release"
    start: "2024-02-20"
    type: "point"
`;

    // State
    let timeline = null;
    let items = new vis.DataSet([]);
    let groups = new vis.DataSet([]);
    const CURRENT_APP_VERSION = "1.0.0";

    // Initialize
    function init() {
        // Check for shared data in URL
        const urlParams = new URLSearchParams(window.location.search);
        const sharedData = urlParams.get('data');

        // Load from LocalStorage
        const savedContent = localStorage.getItem('timeline_content');
        const savedWidth = localStorage.getItem('timeline_layout');
        const savedLayout = localStorage.getItem('timeline_layout_mode') || 'horizontal';
        const editorVisible = localStorage.getItem('editor_visible') === 'true';

        // Prioritize shared data from URL
        let dataLoaded = false;
        if (sharedData) {
            try {
                // UTF-8 compatible base64 decoding
                const decodedData = decodeURIComponent(
                    atob(sharedData)
                        .split('')
                        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                        .join('')
                );
                editor.value = decodedData;
                localStorage.setItem('timeline_content', decodedData);
                dataLoaded = true;
                // Clear URL parameter after loading
                window.history.replaceState({}, document.title, window.location.pathname);
            } catch (e) {
                console.error('Failed to decode shared data:', e);
                // Fall back to saved content
                if (savedContent) {
                    editor.value = savedContent;
                } else {
                    editor.value = defaultData;
                    localStorage.setItem('timeline_content', defaultData);
                }
            }
        } else if (savedContent) {
            editor.value = savedContent;
        } else {
            editor.value = defaultData;
            localStorage.setItem('timeline_content', defaultData);
        }

        if (savedWidth) {
            editorPane.style.width = savedWidth;
        }

        // Apply saved layout
        if (savedLayout === 'vertical') {
            mainContent.classList.add('vertical');
        }

        // Hide editor by default
        if (!editorVisible) {
            editorPane.classList.add('hidden');
            resizer.classList.add('hidden');
        }

        // Timeline Configuration
        const options = {
            height: '100%',
            start: '2023-12-01',
            end: '2024-03-30',
            editable: false,
            onMove: function (item, callback) {
                // TODO: Update YAML when timeline item is moved
                callback(item);
            }
        };

        // Create Timeline
        timeline = new vis.Timeline(timelineContainer, items, groups, options);

        // Initial Render
        updateTimeline();

        // Autoscale to fit all events
        if (timeline) {
            setTimeout(() => timeline.fit(), 100);
        }

        // If data was loaded from URL, update timeline again to ensure it renders
        if (dataLoaded) {
            setTimeout(() => {
                updateTimeline();
                timeline.fit();
            }, 200);
        }

        // Event Listeners
        const debouncedUpdate = debounce((val) => {
            updateTimeline();
            localStorage.setItem('timeline_content', val);
        }, 500);

        editor.addEventListener('input', () => debouncedUpdate(editor.value));

        btnNew.addEventListener('click', () => {
            if (confirm('Discard changes and start new?')) {
                editor.value = defaultData;
                updateTimeline();
                localStorage.setItem('timeline_content', defaultData);
            }
        });

        btnExport.addEventListener('click', exportData);
        btnShare.addEventListener('click', shareAsLink);

        btnLoad.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', loadFile);

        btnToggleEditor.addEventListener('click', toggleEditor);
        btnLayoutToggle.addEventListener('click', toggleLayout);

        initResizer();

        // Periodic Sync (Every 5s)
        setInterval(() => {
            const currentEditorValue = editor.value;
            const storedValue = localStorage.getItem('timeline_content');

            if (currentEditorValue !== storedValue) {
                localStorage.setItem('timeline_content', currentEditorValue);
                console.log('State synced to localStorage (periodic check)');
            }
        }, 5000);
    }

    // Core Logic
    function toggleEditor() {
        const isHidden = editorPane.classList.toggle('hidden');
        resizer.classList.toggle('hidden');

        // Store state (inverted because toggle returns true when class is added)
        localStorage.setItem('editor_visible', isHidden ? 'false' : 'true');

        if (timeline) timeline.redraw();
    }

    function toggleLayout() {
        const isVertical = mainContent.classList.toggle('vertical');
        localStorage.setItem('timeline_layout_mode', isVertical ? 'vertical' : 'horizontal');

        // Reset size when switching layouts
        if (isVertical) {
            editorPane.style.width = '';
            editorPane.style.height = '40%';
        } else {
            editorPane.style.height = '';
            editorPane.style.width = '40%';
        }

        if (timeline) timeline.redraw();
    }

    function initResizer() {
        let isResizing = false;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            resizer.classList.add('active');
            const isVertical = mainContent.classList.contains('vertical');
            document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const isVertical = mainContent.classList.contains('vertical');

            if (isVertical) {
                // Vertical layout - resize height
                const containerHeight = document.body.clientHeight - 60; // Subtract header height
                const newHeight = e.clientY - 60; // Subtract header height
                const newPercentage = (newHeight / containerHeight) * 100;
                if (newPercentage > 10 && newPercentage < 90) {
                    editorPane.style.height = `${newPercentage}%`;
                }
            } else {
                // Horizontal layout - resize width
                const containerWidth = document.body.clientWidth;
                const newWidth = e.clientX;
                const newPercentage = (newWidth / containerWidth) * 100;
                if (newPercentage > 10 && newPercentage < 90) {
                    editorPane.style.width = `${newPercentage}%`;
                    localStorage.setItem('timeline_layout', `${newPercentage}%`);
                }
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                resizer.classList.remove('active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                if (timeline) timeline.redraw();
            }
        });
    }

    function updateTimeline() {
        const yamlText = editor.value;
        try {
            let data = jsyaml.load(yamlText);

            // Handle Migration: If root is array, wrap it
            let events = [];
            if (Array.isArray(data)) {
                events = data;
                // We don't modify the editor value automatically to avoid jumping cursor often,
                // but for internal processing we use the list.
            } else if (data && data.events && Array.isArray(data.events)) {
                events = data.events;
            } else {
                throw new Error("Invalid format: Must be a list of events or object with 'events' key");
            }

            // Update title if present
            if (data.meta && data.meta.title) {
                timelineTitle.textContent = data.meta.title;
                timelineTitle.style.display = 'block';
            } else {
                timelineTitle.textContent = '';
                timelineTitle.style.display = 'none';
            }

            // Handle Groups Metadata FIRST
            let definedGroups = [];
            if (data.groups && Array.isArray(data.groups)) {
                definedGroups = data.groups;
            }

            const processedData = events.map((item, index) => {
                if (!item.content || !item.start) return null;
                // Default group is "->" if not specified
                const grp = item.group || "➡️";

                let end = item.end;
                const type = item.type || (item.end ? 'range' : 'point');

                // If implied or explicit range but missing end, default to today
                if (type === 'range' && !end) {
                    end = new Date().toISOString().split('T')[0];
                }

                // Apply group style and class to event
                let itemStyle = '';
                const groupMeta = definedGroups.find(g => g.name === grp);
                if (groupMeta) {
                    if (groupMeta.color) itemStyle += `color: ${groupMeta.color};`;
                    if (groupMeta.backgroundColor) itemStyle += `background-color: ${groupMeta.backgroundColor}; border-color: ${groupMeta.backgroundColor};`;
                }

                // Create slug for class name
                const slug = grp.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                const className = `grp-${slug}`;

                return {
                    id: index,
                    content: item.content,
                    start: item.start,
                    end: end,
                    type: type,
                    group: grp,
                    className: className,
                    style: itemStyle
                };
            }).filter(i => i !== null);

            // Extract and update groups
            // Ensure unique groups, including the default one if used
            const uniqueGroupNames = [...new Set(processedData.map(item => item.group))];

            const groupData = uniqueGroupNames.map(gName => {
                // Find metadata if available
                const meta = definedGroups.find(g => g.name === gName);

                // Create slug for class name: "My Group" -> "grp-my-group"
                const slug = gName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                const className = `grp-${slug}`;

                let style = '';
                if (meta) {
                    if (meta.color) style += `color: ${meta.color};`;
                    if (meta.backgroundColor) style += `background-color: ${meta.backgroundColor};`;
                }

                return {
                    id: gName,
                    content: gName,
                    className: className,
                    style: style
                };
            });

            // Sync groups: remove old ones not in used, add new ones
            const currentGroupIds = groups.getIds();
            const newGroupIds = groupData.map(g => g.id);

            // Remove groups that are no longer present
            const groupsToRemove = currentGroupIds.filter(id => !newGroupIds.includes(id));
            groups.remove(groupsToRemove);

            // Add/Update existing groups
            groups.update(groupData);

            items.clear();
            items.add(processedData);

            if (processedData.length > 0) {
                timeline.fit();
            }

            hideError();
        } catch (e) {
            showError(e.message);
        }
    }

    // File Operations
    function exportData() {
        let contentToExport = editor.value;
        try {
            const currentContent = jsyaml.load(editor.value);

            // Auto-migration on export: If it's an array (old format), convert to new format
            if (Array.isArray(currentContent)) {
                const newStructure = {
                    meta: {
                        appVersion: CURRENT_APP_VERSION,
                        exportedAt: new Date().toISOString()
                    },
                    events: currentContent
                };
                contentToExport = jsyaml.dump(newStructure);
            }
            // If it's an object but missing meta, add it
            else if (currentContent && typeof currentContent === 'object' && !currentContent.meta) {
                currentContent.meta = {
                    appVersion: CURRENT_APP_VERSION,
                    exportedAt: new Date().toISOString()
                };
                contentToExport = jsyaml.dump(currentContent);
            }
        } catch (e) {
            console.error("Export warning: Invalid YAML, exporting raw text");
        }

        const blob = new Blob([contentToExport], { type: "text/yaml" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "timeline.yaml";
        link.click();
    }

    function shareAsLink() {
        try {
            const yamlContent = editor.value;
            // UTF-8 compatible base64 encoding
            const encodedData = btoa(
                encodeURIComponent(yamlContent).replace(/%([0-9A-F]{2})/g, (match, p1) =>
                    String.fromCharCode('0x' + p1)
                )
            );
            const shareUrl = `${window.location.origin}${window.location.pathname}?data=${encodedData}`;

            // Copy to clipboard
            navigator.clipboard.writeText(shareUrl).then(() => {
                alert('Share link copied to clipboard!');
            }).catch(err => {
                // Fallback: show the URL in a prompt
                prompt('Copy this link to share:', shareUrl);
            });
        } catch (e) {
            alert('Failed to create share link: ' + e.message);
        }
    }

    function loadFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            editor.value = e.target.result;
            updateTimeline();
            localStorage.setItem('timeline_content', e.target.result);
            fileInput.value = ''; // Reset
        };
        reader.readAsText(file);
    }

    // Utilities
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

    function showError(msg) {
        errorMessage.textContent = `Error: ${msg}`;
        errorMessage.classList.remove('hidden');
    }

    function hideError() {
        errorMessage.classList.add('hidden');
    }

    // Run
    init();
});
