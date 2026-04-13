export function bindAnnotationPopupDismissal(onDismiss) {
    document.addEventListener('click', (event) => {
        const popup = document.getElementById('annotationPopup');
        const mapContainer = document.getElementById('mapContainer');

        if (!popup || !mapContainer) {
            return;
        }

        if (!popup.contains(event.target) && !mapContainer.contains(event.target) && popup.classList.contains('active')) {
            onDismiss();
        }
    });
}
