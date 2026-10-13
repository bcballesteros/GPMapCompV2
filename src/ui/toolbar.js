export function bindAnnotationPopupDismissal(onDismiss) {
    document.addEventListener('click', (event) => {
        const popup = document.getElementById('annotationPopup');
        const mapContainer = document.getElementById('mapContainer');
        const colorPickerPopup = event.target.closest?.('.vector-color-popup');

        if (!popup || !mapContainer) {
            return;
        }

        // The shared picker is portaled to document.body. Treat its controls as
        // part of the annotation form so selecting a color cannot cancel it.
        if (!popup.contains(event.target) && !colorPickerPopup && !mapContainer.contains(event.target) && popup.classList.contains('active')) {
            onDismiss();
        }
    });
}
