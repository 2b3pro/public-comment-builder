import Link from 'next/link';

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-10">
          <Link href="/" className="text-primary text-sm font-medium hover:underline mb-4 inline-block">
            &larr; Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            How Public Comment Builder Works
          </h1>
          <p className="text-gray-600">
            Make your voice count in federal rulemaking.
          </p>
        </div>

        {/* FAQ Items */}
        <div className="space-y-8">
          <FAQItem
            question="What is this tool?"
            answer={
              <>
                <p>
                  Public Comment Builder helps you write legally substantive comments on federal regulations.
                  Instead of drafting vague statements like &ldquo;I oppose this rule,&rdquo; this tool helps you
                  craft specific, evidence-based arguments that federal agencies are legally required to address.
                </p>
              </>
            }
          />

          <FAQItem
            question="Why does public commenting matter?"
            answer={
              <>
                <p>
                  Under the Administrative Procedure Act (APA), federal agencies must consider and respond to
                  significant public comments before finalizing regulations. This isn&rsquo;t just a formality&mdash;agencies
                  have lost lawsuits for ignoring substantive comments.
                </p>
                <p className="mt-3">
                  However, most public comments get dismissed because they:
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-600">
                  <li>Simply express support or opposition without explanation</li>
                  <li>Don&rsquo;t reference specific provisions in the regulation</li>
                  <li>Lack concrete evidence or examples</li>
                  <li>Don&rsquo;t suggest actionable alternatives</li>
                </ul>
                <p className="mt-3">
                  For official guidance from the government, see the{' '}
                  <a
                    href="https://www.regulations.gov/commenting-guidance"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Regulations.gov Commenting Guide
                  </a>.
                </p>
              </>
            }
          />

          <FAQItem
            question="How does this tool help?"
            answer={
              <>
                <p>
                  We use AI to analyze the actual regulatory text and generate argument frameworks
                  aligned with federal evaluation criteria, such as:
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-600">
                  <li>Cost-benefit analysis concerns</li>
                  <li>Scientific or technical accuracy</li>
                  <li>Distributional impacts (who bears costs vs. who benefits)</li>
                  <li>Implementation feasibility</li>
                  <li>Effects on small businesses and vulnerable populations</li>
                  <li>Privacy, equity, and civil liberties</li>
                </ul>
                <p className="mt-3">
                  You select the arguments that resonate with you, add your personal experience or expertise,
                  and we generate a professionally formatted comment.
                </p>
              </>
            }
          />

          <FAQItem
            question="How do I use it?"
            answer={
              <>
                <ol className="list-decimal pl-5 space-y-2 text-gray-600">
                  <li>
                    <strong>Find a regulation</strong> &ndash; Browse dockets by deadline or search by keyword
                  </li>
                  <li>
                    <strong>Choose your position</strong> &ndash; Support, oppose, or mixed. Not sure? Click
                    &ldquo;Explore perspectives&rdquo; to see why people take each stance.
                  </li>
                  <li>
                    <strong>Select your arguments</strong> &ndash; Check the reason cards that reflect your concerns.
                    Each card has multiple argument options to choose from.
                  </li>
                  <li>
                    <strong>Add your context</strong> &ndash; Are you an expert? Does this affect your livelihood?
                    Personal experience strengthens your comment.
                  </li>
                  <li>
                    <strong>Generate and review</strong> &ndash; The AI drafts a formal comment. Edit as needed.
                  </li>
                  <li>
                    <strong>Submit</strong> &ndash; Copy your comment and submit via the agency&rsquo;s preferred method
                    (usually email or Regulations.gov).
                  </li>
                </ol>
              </>
            }
          />

          <FAQItem
            question="What makes a comment 'substantive'?"
            answer={
              <>
                <p>
                  A substantive comment that agencies must meaningfully address typically:
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-600">
                  <li>References specific provisions, estimates, or assumptions in the proposed rule</li>
                  <li>Explains <em>how</em> the regulation affects real people, businesses, or systems</li>
                  <li>Identifies what the agency may have overlooked or underestimated</li>
                  <li>Suggests concrete alternatives or modifications</li>
                  <li>Is supported by evidence, data, or lived experience</li>
                </ul>
                <p className="mt-3">
                  This tool structures your comment to hit these criteria automatically.
                </p>
              </>
            }
          />

          <FAQItem
            question="Do you save my comments or personal information?"
            answer={
              <>
                <p>
                  We track anonymous statistics (how many comments drafted per docket, position breakdown)
                  to understand which regulations are getting attention. We do <strong>not</strong> store:
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-600">
                  <li>Your name, email, or identifying information</li>
                  <li>The actual text of your generated comments</li>
                  <li>Your IP address or device information</li>
                </ul>
                <p className="mt-3">
                  Your comment is generated in real-time and only exists in your browser until you copy it.
                </p>
              </>
            }
          />

          <FAQItem
            question="Does this actually work?"
            answer={
              <>
                <p>
                  Yes. Federal courts have consistently held that agencies must meaningfully respond to
                  substantive comments. Well-documented examples include:
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-600">
                  <li>Rules struck down because agencies failed to address technical critiques</li>
                  <li>Regulations modified after public comments identified overlooked populations</li>
                  <li>Deadlines extended when commenters demonstrated insufficient analysis</li>
                </ul>
                <p className="mt-3">
                  The key is quality over quantity. One well-reasoned comment carries more weight than
                  thousands of form letters.
                </p>
              </>
            }
          />

          <FAQItem
            question="How is this different from form letters or petition campaigns?"
            answer={
              <>
                <p>
                  Agencies routinely dismiss identical form letters with a single response. They&rsquo;re legally
                  required to address the <em>substance</em> of comments, not count votes.
                </p>
                <p className="mt-3">
                  This tool generates unique comments based on your specific argument selections and personal context.
                  Each comment is different because each person brings different concerns and experiences.
                </p>
              </>
            }
          />

          <FAQItem
            question="Can I edit the generated comment?"
            answer={
              <>
                <p>
                  Absolutely. The generated comment is a starting point. You can and should:
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-600">
                  <li>Add specific details from your experience</li>
                  <li>Adjust the tone or emphasis</li>
                  <li>Include additional data or citations</li>
                  <li>Remove sections that don&rsquo;t apply to you</li>
                </ul>
                <p className="mt-3">
                  The more you personalize it, the stronger your comment becomes.
                </p>
              </>
            }
          />
        </div>

        {/* CTA */}
        <div className="mt-12 p-6 bg-white rounded-xl border border-gray-200 text-center">
          <h3 className="font-bold text-gray-900 mb-2">Ready to make your voice heard?</h3>
          <p className="text-gray-600 text-sm mb-4">
            Find a regulation that matters to you and draft a substantive comment.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-primary text-white font-bold px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors"
          >
            <span className="material-symbols-outlined">search</span>
            Browse Regulations
          </Link>
          <p className="mt-4 text-xs text-gray-400">
            New to public commenting?{' '}
            <a
              href="https://www.regulations.gov/commenting-guidance"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Read the official government guide
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function FAQItem({ question, answer }: { question: string; answer: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-start gap-2">
        <span className="material-symbols-outlined text-primary mt-0.5">help</span>
        {question}
      </h2>
      <div className="text-gray-600 text-sm leading-relaxed pl-8">
        {answer}
      </div>
    </div>
  );
}
