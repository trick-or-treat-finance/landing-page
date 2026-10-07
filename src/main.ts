import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "./style.css";
import "./landing.css";
import "./grow.css";
import "./theme.css";
import "./theme";

// Only the home page has anything to wake up; the other pages get the day/night switch alone.
if (document.body.classList.contains("home")) { void import("./landing"); void import("./grow"); void import("./signup"); }
