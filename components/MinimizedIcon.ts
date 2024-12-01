import { restoreSidebar } from "./Sidebar";
import "./sidebar.css";

let isDarkMode = true; // Default to dark mode

export function createMinimizedIcon() {
  let minimizedIcon = document.getElementById("minimizedSidebarIcon");

  // Only create the icon if it doesn’t already exist
  if (!minimizedIcon) {
    minimizedIcon = document.createElement("div");
    minimizedIcon.id = "minimizedSidebarIcon";
    minimizedIcon.className = isDarkMode
      ? "dark-minimized-icon"
      : "light-minimized-icon";

    minimizedIcon.innerHTML = `<img src="https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.png" alt="Icon" style="width: 22px; height: 22px;" />`;
    minimizedIcon.onclick = () => restoreSidebar(); // Add restore behavior

    // Set initial position at the top-right corner
    minimizedIcon.style.position = "fixed";
    minimizedIcon.style.top = "10px";
    minimizedIcon.style.right = "10px";
    minimizedIcon.style.zIndex = "1000";

    document.body.appendChild(minimizedIcon);

    // Add drag-and-drop functionality
    addDragFunctionalityToIcon(minimizedIcon);

    // Ensure the icon is visible
    minimizedIcon.style.visibility = "visible";
  }
}

function addDragFunctionalityToIcon(icon: HTMLElement) {
  let isDragging = false;
  let startX: number, startY: number, initialX: number, initialY: number;

  // Mouse Down Event: Start dragging
  icon.addEventListener("mousedown", (event) => {
    isDragging = true;
    icon.classList.add("dragging");

    // Record the initial positions
    startX = event.clientX;
    startY = event.clientY;

    const rect = icon.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;

    event.preventDefault(); // Prevent text selection
  });

  // Mouse Move Event: Update position dynamically
  document.addEventListener("mousemove", (event) => {
    if (!isDragging) return;

    // Calculate the new position
    const deltaX: number = event.clientX - startX;
    const deltaY = event.clientY - startY;

    // Constrain to viewport boundaries
    const newX = Math.max(
      0,
      Math.min(window.innerWidth - icon.offsetWidth, initialX + deltaX)
    );
    const newY = Math.max(
      0,
      Math.min(window.innerHeight - icon.offsetHeight, initialY + deltaY)
    );

    // Update the position of the icon
    icon.style.left = `${newX}px`;
    icon.style.top = `${newY}px`;
    icon.style.position = "fixed"; // Ensure it stays in the viewport
  });

  // Mouse Up Event: Stop dragging
  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      icon.classList.remove("dragging");
    }
  });
}
