// Save plot functionality
function savePlot() {
    // Get the plot figure element from matplotlib
    const displayContainer = document.querySelector('.display-container');
    const plotElements = displayContainer.querySelectorAll('img, canvas, svg');
    
    if (plotElements.length === 0) {
        alert('No plot to save. Please generate a plot first.');
        return;
    }
    
    // Get target name and create filename
    const targetNameInput = document.querySelector('#target_name_input');
    let filename = 'target_plot.png'; // default filename
    
    if (targetNameInput && targetNameInput.value.trim()) {
        const targetName = targetNameInput.value.trim();
        // Replace spaces with underscores and remove any problematic characters
        const sanitizedName = targetName.replace(/\s+/g, '_').replace(/[<>:"/\\|?*]/g, '');
        filename = `${sanitizedName}_plot.png`;
    }
    
    // Try to find the matplotlib figure
    const plotElement = plotElements[plotElements.length - 1]; // Get the most recent plot
    
    if (plotElement.tagName === 'IMG') {
        // If it's an image, create a download link
        const link = document.createElement('a');
        link.download = filename;
        link.href = plotElement.src;
        link.click();
    } else if (plotElement.tagName === 'CANVAS') {
        // If it's a canvas, convert to blob and download
        plotElement.toBlob(function(blob) {
            const link = document.createElement('a');
            link.download = filename;
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
        });
    } else {
        // Fallback: try to capture the entire display container
        alert('Plot saving is available after generating a plot.');
    }
}

// Enable save button when plot is generated
function enableSaveButton() {
    const saveButton = document.querySelector('#save_button');
    if (saveButton) {
        saveButton.disabled = false;
    }
}

// Monitor for plot generation
const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.type === 'childList') {
            const displayContainer = document.querySelector('.display-container');
            // Only look for matplotlib plot images, not any img elements
            const plotElements = displayContainer.querySelectorAll('img[src*="data:image"]');
            if (plotElements.length > 0) {
                enableSaveButton();
            }
        }
    });
});

// Start observing when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    const displayContainer = document.querySelector('.display-container');
    if (displayContainer) {
        observer.observe(displayContainer, { childList: true, subtree: true });
    }
    
    // Add click handler for save button
    const saveButton = document.querySelector('#save_button');
    if (saveButton) {
        saveButton.addEventListener('click', savePlot);
    }

    document.getElementById('date_input').valueAsDate = new Date();
});