import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "./style.css";
import "./landing.css";
import "./grow.css";

// Only the home page has anything to wake up; the about page stays script-free.
if (document.body.classList.contains("home")) { void import("./landing"); void import("./grow"); }
