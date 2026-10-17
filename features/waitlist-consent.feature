Feature: The "be the first to know" form asks for consent and sends it
  The list now refuses a sign-up without consent (backend HAG-912: POST /leads needs consent true and
  answers 422 without it). So the page shows the consent in plain sight as a checkbox that starts
  unchecked, will not send without it, sends it with the address, and talks to our list and to no one else.

  Background:
    Given the site is built with the address of our own list

  Scenario: The consent is a checkbox in the exact words, unchecked
    When a visitor opens the form
    Then there is a checkbox labelled "I agree to be emailed once when this launches, and I can leave the list from the link in that email."
    And it is not checked

  Scenario: Without the box checked nothing is sent and the page says why
    When the visitor types "maya@example.com" and submits without ticking the box
    Then no request goes to our list
    And a message that can be read aloud asks them to agree, and they can still tick and submit

  Scenario: With the box checked the request carries the consent
    When the visitor types "maya@example.com", ticks the box and submits
    Then exactly one POST goes to our list with the email, the source, the hidden box and consent true

  Scenario: No request goes to beehiiv or any third party
    When a visitor reads, opens and submits the form, built with or without the address of our list
    Then the only site the page asks anything of, besides itself, is our list, and never beehiiv

  Scenario Outline: A refusal from the list is shown without repeating what the server said
    When the visitor ticks the box and submits and the list answers 422 with <body>
    Then the page shows an error and none of the server's words
    And the visitor can try again

  Scenario: Control: something that is not an address is still not sent
    When the visitor submits "nope" with the box ticked
    Then no request goes to our list and the page asks for a real address
