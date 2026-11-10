export function isLayerNameTruncated(nameElement) {
    return Boolean(nameElement && (
        nameElement.scrollWidth > nameElement.clientWidth + 1 ||
        nameElement.scrollHeight > nameElement.clientHeight + 1
    ));
}
