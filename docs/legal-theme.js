(() => {
  const button = document.querySelector("[data-theme-toggle]");
  const label = () =>
    document.documentElement.classList.contains("dark")
      ? "Switch to light mode"
      : "Switch to dark mode";

  if (!button) {
    return;
  }

  button.setAttribute("aria-label", label());
  button.textContent = document.documentElement.classList.contains("dark")
    ? "Light"
    : "Dark";

  button.addEventListener("click", () => {
    const nextTheme = document.documentElement.classList.contains("dark")
      ? "light"
      : "dark";

    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    sessionStorage.setItem("theme", nextTheme);
    button.setAttribute("aria-label", label());
    button.textContent = nextTheme === "dark" ? "Light" : "Dark";
  });
})();
