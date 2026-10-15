Feature: The stage shows a 3D ghost picture where the 2D drawing was
  Builds on stage-ghost-removed.feature (already in #46) and replaces exactly one line of it:
  "the stage shows no ghost picture of any kind" no longer holds. Every other line there stays,
  including: no element with class ghost-spot, lamp, gh or gh-hero, no 2D svg, no floor shadow
  or glow drawn in css, the switch, the numbers, scripts off, the gap check. Same PR rules (tests
  first, red then green; the one changed line is a Test change: commit). Written by Kelly against
  #46 head daefcd3. The new picture's class is the author's choice but is not one of the removed
  names. The owner's image is the source; the master file is never served as is.

  Scenario: A 3D ghost picture is on the stage next to the receipt, in light and in dark
    Given the built home page at 390 and at 1280 pixels wide, in light and in dark mode
    Then exactly one picture element with a ghost image is inside the stage, beside or above the receipt where the 2D ghost used to be
    And it is visible and fully shown, not cropped, in both views, Trick and Treat
    And it is the stage's only ghost picture, and the hero picture above is unchanged

  Scenario: The picture has no card behind it
    Given the same four sizes and modes
    Then the picture element and its img have computed background transparent, no border, no box-shadow and no rounded frame
    And no rule in the shipped css gives it a card
    And the pixel at each corner of the picture's box equals the page background, in light and in dark

  Scenario: The picture itself is transparent
    Then every served stage variant has an alpha channel: PNG RGBA or tRNS, WebP with the alpha flag, AVIF with an alpha plane
    And the corner pixels of the largest file have alpha 0
    And the fallback is a PNG, not a JPEG
    And the existing check that every served landing image is transparent walks the stage folder and finds at least the stage files

  Scenario: The picture is small, modern and has a fallback
    Then it is a picture element with AVIF and WebP sources and a PNG img fallback, and every file named in a src or srcset exists in the build output
    And srcset and sizes give at least a small and a large width, so a phone does not fetch the desktop file
    And at 390 and at 1280 the browser fetches one stage file of 150 KB or less
    And the master image is not in the build output
    And the control: the weight check fails when a 151 KB file is put in its place

  Scenario: The picture is explicit about its size and does not shift the page
    Then the img has width and height attributes that match the file's aspect ratio
    And the layout shift of the home page is 0 for the stage
    And it is lazy-loaded (loading="lazy" and decoding="async"), because it is below the first screen, and it has no fetchpriority high
    And with scripts off the picture is still there

  Scenario: The picture is decoration with an honest alt
    Then the img has alt="" and the picture is not read out, or a short alt that names the ghost and nothing the page already says
    And it shows no bank logo or bank name and no company the page does not already name
    And the page adds no new host, script, tracker or font, and the content security policy is unchanged

  Scenario: The old 2D drawing stays gone
    Then no inline svg of class gh or gh-hero, no lamp and no css or script used only by them is in the source
    And the removed eggs (blink, poke, boop) are not brought back for the new picture unless a separate scenario asks for them

  Scenario: The switch works and no empty gap is left
    Given the built home page with scripts on
    When the visitor presses the switch (click, Space and Enter)
    Then aria-checked flips, the receipt and the company tiles swap as before, and the numbers are unchanged
    And the 3D ghost stays in place with the same transparent background in both views
    And the gap checks of stage-ghost-removed.feature still pass with the picture in place: no empty block, gap under the switch at most 40 px, tiles level with the switch on desktop, no sideways scroll
    And the picture does not make the section taller than the room it is given: nothing is clipped or overlaps the receipt, the tiles or the switch at 390 and at 1280

  Scenario: Evidence is on the PR
    Then the PR holds screenshots of the stage at 390 and at 1280, in light and in dark, in Trick and in Treat (eight images), with no dark card in any
