Feature: The hero says "personal finance app" first and shows the ghost with no card behind it
  Next to personal-finance.feature and hero-ghost-3d.feature; same PR rules (tests first, red then
  green, a Test change: commit for any existing test that must change). Written by Kelly
  against main at b96b982, where the hero still has the lede "every swipe is a vote..." and the
  picture sits on a card (.hero-art has border-radius and background: var(--art-ground)).
  Strings are checked whole. "Every page" is index, about, 404 and hello-hacker, read as built.

  Scenario: A badge above the headline says what this is
    Given the built home page
    When the hero is read in document order
    Then a badge with the exact text "Personal finance app" comes before the one h1
    And it is inside the hero, not in the header or the nav
    And it is plain text in an element of its own, not an image and not part of the h1
    And the h1 text is unchanged: "your receipts already say who you back."
    And the badge is a pill: bold, on a brand-green fill, with a computed font size of at least 14 px and a padding that makes it taller than a line of body text, so it is not eyebrow text
    And its text against its fill has a contrast ratio of at least 4.5 to 1 in light and in dark

  Scenario: The badge is on the home page only and is not repeated
    When every page is read
    Then "Personal finance app" as a badge appears once on the home page and on no other page
    And the home page has exactly one h1

  Scenario: The old line is gone from everywhere
    When every page is read, with tags and attributes included, and every shipped script
    Then the text "every swipe is a vote" appears nowhere, in any letter case, with a straight or curly apostrophe in the line around it, in text, alt, aria-label, title, meta, og or twitter tags
    And no test, stylesheet or script still expects it
    And the scenario fails if the line is put back on any one page

  Scenario: The two old hero lines are replaced, not kept beside the new ones
    Given the built home page
    Then the hero does not hold "Trick or Treat is a personal finance app. See which companies get your money."
    And the hero does not hold "every swipe is a vote"
    And the hero holds exactly one lede paragraph, the new sub-line, and no second plain line

  Scenario: The sub-line is the plain sentence
    Given the built home page
    Then the hero holds the exact text "Budget, track your spending, and see exactly which companies get your money." once
    And it sits in the hero under the h1, above the two buttons
    And it is visible without scrolling on a 390 by 844 screen
    And it is larger than body text (computed font size above the page's body size) and its contrast against the page is at least 7 to 1 in light and in dark
    And the buttons, the hint "example numbers. nothing leaves your tab." and the safety words "Not investment advice" are unchanged
    And the line does not say "connect your bank" or ask for a login or an account number

  Scenario: The picture has no card behind it, in light and in dark
    Given a visitor opens the home page at 390 and at 1280 pixels wide, in light and in dark mode
    Then the hero picture element has no background, no background-color, no border and no box-shadow, and its computed background is transparent
    And no rule in the shipped css gives the hero picture a card: no --art-ground background on it and no overflow:hidden rounded frame
    And a screenshot of the hero area, taken in dark mode and in light mode, shows the page's own background colour in the corners of the picture box (pixel at each corner equals the page background)
    And the ghost, the receipts and the trays are fully visible, not cropped

  Scenario: The picture itself is transparent
    Then every served variant is a file with an alpha channel: the PNG fallback is RGBA and the AVIF and WebP variants carry alpha
    And the corner pixels of the 1536 by 1024 file have alpha 0
    And the fallback is a PNG, not a JPEG, because a JPEG cannot be transparent
    And the old opaque JPEG variants of the hero are no longer in the build output

  Scenario: The picture is still small, modern and has a fallback
    Then the page serves the picture in a picture element as AVIF and WebP with a PNG fallback
    And at the default width the browser fetches one file of 150 KB or less, in light and in dark
    And srcset and sizes still give at least a small, a medium and a large width
    And every file named in a src or srcset exists in the build output
    And the control: the weight check fails when an AVIF or WebP of 151 KB is put in its place

  Scenario: The picture keeps its explicit size
    Then the img still has width 1536 and height 1024
    And the cumulative layout shift of the home page is 0 for the hero
    And the img still has fetchpriority high and no loading=lazy
    And the alt text is unchanged and non-empty

  Scenario: No page or script says sort
    Then the existing test that no page, toast or script says "sort" still passes
    And the new badge and sub-line do not contain the word, in any letter case

  Scenario: Nothing else changed
    Then the page adds no new host, script, tracker or font, and the content security policy is unchanged
    And the title, meta description, og and twitter tags and og.jpg are unchanged
    And the theme button and the email signup work as before
    And the existing site tests pass

  Scenario: The ghost under the Trick/Treat switch is a 3D picture in the hero's style
    Given the built home page
    Then the old 2D stage drawing is gone: no inline svg with class gh gh-hero, no "Decorative. The Trick or Treat ghost with a bank bag and a phone." and no css or file left only for it
    And the stage shows a 3D picture in a picture element with a PNG fallback, a transparent background and no dark card, in light and in dark, as in the hero scenario above
    And the picture shows no bank logo and no bank name, and the page names no new company for it
    And it has explicit width and height, is a decorative picture with alt="" and aria-hidden or a short alt that names the ghost, and shifts nothing (layout shift 0)
    And the file fetched at the default width is 150 KB or less

  Scenario: The Trick/Treat switch still works
    Given the built home page with scripts on
    When the visitor presses the switch (click, then Space and Enter from the keyboard)
    Then aria-checked flips between "false" and "true" and the receipt view and the basket view swap as before
    And the 3D ghost stays in place, visible, with the same transparent background in both views
    And with scripts off the page still shows the receipt, as the noscript note says

  Scenario: Evidence is on the PR
    Then the PR holds screenshots of the home hero and of the stage at 390 and at 1280 pixels, in light and in dark (eight images), with no dark card in any of them
