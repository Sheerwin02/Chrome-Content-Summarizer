import "./sidebar.css";

export function createContentArea() {
    const contentArea = document.createElement("div");
    contentArea.id = "summaryContent";
    contentArea.className = "content-area";

    return contentArea;
}