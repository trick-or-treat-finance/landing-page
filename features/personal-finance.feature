Feature: The landing page says plainly that Trick or Treat is a personal finance app
  A first-time visitor, or someone who sees a shared link, must learn in one glance what this is.
  The joke stays; the plain words go beside it. Strings below are checked whole, not by keyword.
  Copy: Phyllis's list (hive message 2026-10-15T02-07-58).

  Scenario: The sub-line is above the fold
    Given a visitor opens the home page on a 390 by 844 screen
    When the page has loaded and nothing has been scrolled
    Then the text "Trick or Treat is a personal finance app. See which companies get your money." is visible
    And it sits in the hero directly under the h1, and the playful h1 is unchanged

  Scenario: Title and description say it
    When the home page's head is read
    Then the title is "Trick or Treat: the personal finance app that shows who you pay"
    And the meta description is "A personal finance app that shows which companies get your money. Try a sample month in your browser. Not investment advice."
    And the html element has lang "en"

  Scenario: A shared link says it
    When the home page's og and twitter tags are read
    Then og:title and twitter:title equal the page title
    And og:description and twitter:description equal the meta description
    And og:site_name is "Trick or Treat" and og:url is "https://trickortreat.fi"
    And twitter:card is "summary_large_image"
    And og:image is an absolute https URL on trickortreat.fi, with og:image:width 1200, og:image:height 630 and an og:image:alt that says "personal finance app"
    And the image file exists, is 1200 by 630 pixels and is under 1 MB
    And the words "personal finance app" are in the image, large enough to read at 300 pixels wide

  Scenario: The footer explains the domain
    When the footer is read
    Then it says "Trick or Treat is a personal finance app. .fi is for finance."
    And nothing says or implies the product is Finnish or only for Finland

  Scenario: The safety words stay
    Then the home page still says "Not investment advice" in its disclaimer
    And it still has the section "What it won't ask for" and the nav link "what we won't ask" to it

  Scenario: The new copy adds no bank ask
    Given the existing how-it-works step "Connect your bank. Read-only, via Plaid." stays as it is
    Then the new hero sub-line, title, meta and share descriptions, share image text and footer do not say "connect your bank" or ask for a bank login or account number
    And the share image and og:image:alt do not show a bank or a login
    And no new control is added that asks for a bank, and the only sign-up ask is the existing email signup
    And the how-it-works step is the only place on either page that says "Connect your bank", and its words are unchanged

  Scenario: No claim the page cannot back
    Then no text says the app gives financial advice, guarantees a return, or is regulated
    And "iPhone", "App Store" and "web app" are not named unless they are already on the page

  Scenario: Nothing new is loaded or sent
    Then the page adds no script, tracker, font or image host that it did not load before
    And the content security policy and every existing link are unchanged
    And the og image URL is the only changed URL in the head

  Scenario: The about page agrees
    When about.html's title, description and og and twitter tags are read
    Then each states in plain words that Trick or Treat is a personal finance app
    And its og:image, og:url and twitter:card equal the home page's
    And its text does not contradict the home page

  Scenario: Both pages stay valid
    Then both pages parse as HTML with one h1 and no duplicate meta property
    And the existing site tests still pass

  Scenario: The theme control is one icon button showing a sun or a moon
    Given a visitor opens the home page, and again the about page
    When the top-right theme control is read
    Then it is a single button, not a switch or toggle track: no role=switch, no aria-checked, no aria-pressed
    And in light mode it shows a moon and in dark mode it shows a sun, so the icon names the mode it switches to
    And no jar, pumpkin or track-and-knob graphic is left on either page
    And its aria-label names the mode it switches to: "Switch to dark mode" in light, "Switch to light mode" in dark, and the label changes with the mode

  Scenario: The theme button looks pressable and is easy to use
    When the button is hovered, focused by keyboard, and pressed
    Then it has a visible resting outline or ring, a distinct hover state and a visible focus ring in both modes
    And it is at least 44 by 44 points and reachable and usable by keyboard (Enter and Space)

  Scenario: The theme change respects reduced motion
    Given the visitor has prefers-reduced-motion set to reduce
    When they press the theme button
    Then the icon and colours change with no animation or transition
    And without that setting any transition is under 300 ms

  Scenario: The theme choice is unchanged underneath
    Then the choice persists as it did before, and nothing new is stored or sent
