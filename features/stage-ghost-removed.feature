Feature: The 2D ghost on the stage is gone, and nothing is left where it stood
  Next to hero-finance-clear.feature; same PR rules (tests first, red then green, a Test change:
  commit for any existing test that pinned the ghost). Written by Kelly against #45's head
  1ac09bb, where the stage still has <div class="ghost-spot"> with <div class="lamp"> (the floor
  shadow) and <svg class="gh gh-hero"> ("Decorative. The Trick or Treat ghost with a bank bag
  and a phone."). This replaces the four stage-ghost scenarios of hero-finance-clear.feature:
  the stage gets no ghost at all.

  Scenario: The 2D stage ghost and its floor shadow are not on the page, in light and in dark
    Given the built home page at 390 and at 1280 pixels wide, in light and in dark mode
    Then no element with class ghost-spot, lamp, gh or gh-hero exists on the page
    And no svg on the stage has the aria-label "Decorative. The Trick or Treat ghost with a bank bag and a phone."
    And the stage shows no ghost picture of any kind, and no floor shadow or glow where the ghost stood
    And the hero picture above is still there, unchanged

  Scenario: No 2D stage drawing is left in the source
    Given the source and the built home page
    Then index.html holds no svg element of class gh or gh-hero and no markup for the lamp
    And src/landing.css, src/theme.css and every script hold no rule, selector or animation used only by it: ghost-spot, .lamp, .gh-hero, and the float keyframes if nothing else uses them
    And the ghost-body symbol is removed too if nothing else on the page references it, and is kept if the nav or another picture still does
    And no test still expects the removed ghost, and the scenario fails if the markup or any of those rules is put back

  Scenario: The Trick/Treat switch still flips the receipt between what it cost and what it could buy
    Given the built home page with scripts on
    When the visitor presses the switch (click, then Space and Enter from the keyboard)
    Then aria-checked goes from "false" to "true" and back
    And the page's data-view goes between "trick" and "treat", and the live region says which view is showing
    And in Trick the receipt of the sample month is shown, and in Treat the company tiles and the note "Nothing to own." are shown, each as before
    And the numbers are unchanged: $4,449.88 in total and $2,488.88 mapped to a company

  Scenario: With scripts off the page still shows the sample month
    Given the built home page with scripts off
    Then the receipt is shown and the noscript note about $2,488.88 of $4,449.88 is shown

  Scenario: No empty gap is left where the ghost was
    Given the built home page at 390 and at 1280 pixels wide, in light and in dark mode
    When the stage section is measured in Trick and in Treat
    Then the switch group is directly followed by the receipt in Trick and by the tiles in Treat, with a vertical gap no larger than the gap the same two blocks have elsewhere on the page (no more than 32 px more than the section's own padding)
    And the stage section is no taller than it was with the ghost minus the ghost's own height, so a bare block of about the ghost's size is not left behind
    And at 1280 the right column's content starts at the top of its column, level with the left column's first block, not pushed down
    And nothing overflows sideways: scrollWidth is at most the window width at both sizes
    And the control: with a 200 px empty div put back where the ghost stood, the gap check fails

  Scenario: Nothing else on the page changed
    Then the badge, the h1, the sub-line, the hero picture, the nav, the theme button, the email signup, the title, meta, og and twitter tags are unchanged
    And the page adds no new host, script, tracker or font, and the content security policy is unchanged
    And no user-facing text says "sort"
    And the existing site tests pass, with the control that each new check read something
