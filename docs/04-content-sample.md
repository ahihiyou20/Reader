# 04 — Bài mẫu (seed & test fixture)

Bài này dựng lại nội dung thấy trong video tham chiếu, viết lại và bổ sung để đủ 7 section. Đường dẫn seed khi code: `content/seed/smarter-decisions.json`. Format theo `Article` ở [02-technical-specs.md §3](./02-technical-specs.md#3-data-model-firestore).

Ký hiệu đọc nhanh trong bản xem trước: **đậm**, *nghiêng*, `[[vàng:…]]`, `[[hồng:…]]`, `[[xanh:…]]` là highlight; `{CNBC (2025)}` là chip nguồn.

## 1. Bản xem trước (EN)

**Title:** How to make smarter decisions more easily?
**Category:** psychology · **Cover:** ảnh người đứng nhìn về phía con đường lát đá (tông đỏ/xanh tối)

1. *(hook)* Have you ever stood at an important crossroads, changing jobs, moving homes, or ending a relationship, and just stayed frozen there, unable to take a single step? It was not because you lacked information. It was not because you were not smart enough. It was because your brain was quietly playing its own game.
2. **The problem is not you, it is biology** — According to data from {CNBC (2025)}, an adult makes around [[hồng:35,000 decisions a day]]. Every choice, from what to eat to which email to answer first, draws from the same limited pool of mental energy. By evening, that pool runs dry, a state researchers call **decision fatigue**.
3. Nobel Prize-winning psychologist **Daniel Kahneman**, in his book *Thinking, Fast and Slow* [[vàng:(2011)]], describes two modes of thinking: **System 1** operates fast, automatically, and intuitively, while **System 2** is slow, conscious, and analytical. About [[hồng:95% of everyday decisions]] are driven by System 1. That is not inherently bad, but it makes us vulnerable to **cognitive biases**.
4. Research on {PMC/NIH (2022)} highlights two of the most common biases: **confirmation bias** (*confirmation bias*), which causes you to [[hồng:unconsciously seek out information that supports what you already believe]], ignoring contradicting evidence; and **anchoring bias** (*anchoring bias*), which causes you to [[hồng:rely too heavily on the first number or opinion you hear]]. When you look back at a poor decision from your past, you will almost always find one of them.
5. **Not every decision deserves the same level of thinking** — In Amazon's 2016 shareholder letter, [[vàng:Jeff Bezos]] divided decisions into two types: **"one-way doors"**, which are irreversible and require careful consideration; and **"two-way doors"**, which can be reversed and should be decided quickly. Most decisions in life belong to [[xanh:the second type]], yet we treat them as if they were the first. That is the root cause of **analysis paralysis** (*analysis paralysis*).
6. **A good decision does not guarantee a good outcome, and that is completely normal** — Decision-making expert **Annie Duke**, author of *Thinking in Bets*, calls this mistake [[hồng:"resulting"]]: judging the quality of a decision based on its outcome. In reality, a decision made with complete information can still lead to [[hồng:an undesirable outcome]] due to [[hồng:random factors]]. The goal is not a perfect decision. The goal is **the decision with the best probability** given the conditions you are working with.
7. **Small habits, sharper choices** — Make your important decisions in the morning, when your mental energy is highest {APA (2023)}. Reduce trivial choices with routines, and before you decide, write down one piece of evidence that [[xanh:could prove you wrong]].

**KEY POINT:** Making smarter decisions is like [[hồng:learning to drive]]. At first, you have to think through every single move. Over time, it becomes a reflex. Start with something small today: with your next decision, ask yourself, *is this a one-way door or a two-way door?*

**Sources (10):** CNBC (2025) · Kahneman, *Thinking, Fast and Slow* (2011) · PMC/NIH (2022) · Amazon Shareholder Letter (2016) · Duke, *Thinking in Bets* (2018) · APA (2023) · Baumeister et al., *Journal of Personality and Social Psychology* (1998) · Tversky & Kahneman, *Science* (1974) · Nickerson, *Review of General Psychology* (1998) · Harvard Business Review (2020)

**Apply:**
1. Before your next decision, label it: one-way door or two-way door. If two-way, decide in under 2 minutes.
2. Write down one piece of evidence that could prove your current opinion wrong.
3. Move tomorrow's most important decision to the first 2 hours of your morning.

## 2. Bản xem trước (VI)

**Title:** Làm sao để đưa ra quyết định sáng suốt hơn một cách dễ dàng?

1. *(hook)* Bạn đã bao giờ đứng trước một ngã rẽ quan trọng — đổi việc, chuyển nhà, hay kết thúc một mối quan hệ — và cứ đứng sững ở đó, không thể bước nổi một bước? Không phải vì bạn thiếu thông tin. Không phải vì bạn không đủ thông minh. Mà vì bộ não của bạn đang lặng lẽ chơi trò chơi của riêng nó.
2. **Vấn đề không nằm ở bạn, mà ở sinh học** — Theo dữ liệu từ {CNBC (2025)}, một người trưởng thành đưa ra khoảng [[hồng:35.000 quyết định mỗi ngày]]. Mỗi lựa chọn, từ ăn gì đến trả lời email nào trước, đều rút từ cùng một "bình" năng lượng tinh thần có hạn. Đến tối, bình cạn — trạng thái mà các nhà nghiên cứu gọi là **mệt mỏi quyết định** (*decision fatigue*).
3. Nhà tâm lý học đoạt giải Nobel **Daniel Kahneman**, trong cuốn *Tư duy nhanh và chậm* [[vàng:(2011)]], mô tả hai chế độ tư duy: **Hệ thống 1** vận hành nhanh, tự động và theo trực giác, còn **Hệ thống 2** chậm, có ý thức và phân tích. Khoảng [[hồng:95% quyết định hằng ngày]] do Hệ thống 1 dẫn dắt. Điều đó không hẳn xấu, nhưng khiến ta dễ mắc **thiên kiến nhận thức** (*cognitive biases*).
4. Nghiên cứu trên {PMC/NIH (2022)} chỉ ra hai thiên kiến phổ biến nhất: **thiên kiến xác nhận** (*confirmation bias*), khiến bạn [[hồng:vô thức tìm kiếm thông tin ủng hộ điều mình đã tin]] và phớt lờ bằng chứng trái ngược; và **hiệu ứng mỏ neo** (*anchoring bias*), khiến bạn [[hồng:dựa quá nhiều vào con số hay ý kiến đầu tiên nghe được]]. Nhìn lại một quyết định tồi trong quá khứ, bạn gần như luôn thấy một trong hai.
5. **Không phải quyết định nào cũng đáng nghĩ ở cùng một mức độ** — Trong thư gửi cổ đông Amazon năm 2016, [[vàng:Jeff Bezos]] chia quyết định thành hai loại: **"cửa một chiều"**, không thể đảo ngược và cần cân nhắc kỹ; và **"cửa hai chiều"**, có thể quay lại và nên quyết nhanh. Phần lớn quyết định trong đời thuộc [[xanh:loại thứ hai]], vậy mà ta lại đối xử với chúng như loại thứ nhất. Đó là gốc rễ của **tê liệt vì phân tích** (*analysis paralysis*).
6. **Quyết định tốt không đảm bảo kết quả tốt, và điều đó hoàn toàn bình thường** — Chuyên gia ra quyết định **Annie Duke**, tác giả *Thinking in Bets*, gọi sai lầm này là [[hồng:"resulting"]]: đánh giá chất lượng quyết định dựa trên kết quả. Thực tế, một quyết định có đủ thông tin vẫn có thể dẫn tới [[hồng:kết quả không mong muốn]] vì [[hồng:yếu tố ngẫu nhiên]]. Mục tiêu không phải là quyết định hoàn hảo, mà là **quyết định có xác suất tốt nhất** trong điều kiện bạn đang có.
7. **Thói quen nhỏ, lựa chọn sắc bén** — Hãy đưa ra quyết định quan trọng vào buổi sáng, khi năng lượng tinh thần cao nhất {APA (2023)}. Giảm các lựa chọn vụn vặt bằng thói quen cố định, và trước khi quyết, hãy viết ra một bằng chứng [[xanh:có thể chứng minh bạn sai]].

**KEY POINT:** Ra quyết định sáng suốt giống như [[hồng:học lái xe]]. Lúc đầu, bạn phải nghĩ từng thao tác. Dần dần, nó trở thành phản xạ. Hãy bắt đầu từ việc nhỏ hôm nay: với quyết định tiếp theo, tự hỏi *đây là cửa một chiều hay cửa hai chiều?*

**Apply:**
1. Trước quyết định tiếp theo, gắn nhãn: cửa một chiều hay hai chiều. Nếu hai chiều, quyết trong dưới 2 phút.
2. Viết ra một bằng chứng có thể chứng minh ý kiến hiện tại của bạn là sai.
3. Dời quyết định quan trọng nhất ngày mai vào 2 giờ đầu buổi sáng.

## 3. JSON seed (rút gọn — đủ để test renderer)

Section 3–7 và bản VI theo đúng cấu trúc của section 1–2; khi code, chuyển đủ toàn bộ nội dung ở mục 1–2 sang JSON.

```json
{
  "id": "smarter-decisions",
  "slug": "smarter-decisions",
  "category": "psychology",
  "tags": ["decision making", "cognitive bias", "productivity"],
  "keywords": ["decision", "decisions", "quyet dinh", "decision fatigue", "confirmation bias", "thien kien", "kahneman", "bezos", "one-way door"],
  "cover": {
    "type": "image",
    "url": "/seed/smarter-decisions.webp",
    "blurDataURL": "data:image/webp;base64,UklGR…",
    "dominant": "#3B1A1A"
  },
  "title": {
    "en": "How to make smarter decisions more easily?",
    "vi": "Làm sao để đưa ra quyết định sáng suốt hơn một cách dễ dàng?"
  },
  "sections": [
    {
      "variant": "hook",
      "body": {
        "en": [[{ "t": "text", "v": "Have you ever stood at an important crossroads, changing jobs, moving homes, or ending a relationship, and just stayed frozen there, unable to take a single step? It was not because you lacked information. It was not because you were not smart enough. It was because your brain was quietly playing its own game." }]],
        "vi": [[{ "t": "text", "v": "Bạn đã bao giờ đứng trước một ngã rẽ quan trọng — đổi việc, chuyển nhà, hay kết thúc một mối quan hệ — và cứ đứng sững ở đó, không thể bước nổi một bước? Không phải vì bạn thiếu thông tin. Không phải vì bạn không đủ thông minh. Mà vì bộ não của bạn đang lặng lẽ chơi trò chơi của riêng nó." }]]
      }
    },
    {
      "variant": "body",
      "heading": { "en": "The problem is not you, it is biology", "vi": "Vấn đề không nằm ở bạn, mà ở sinh học" },
      "body": {
        "en": [[
          { "t": "text", "v": "According to data from " },
          { "t": "cite", "v": "CNBC (2025)", "sourceId": "cnbc-2025" },
          { "t": "text", "v": ", an adult makes around " },
          { "t": "hl", "v": "35,000 decisions a day", "color": "pink" },
          { "t": "text", "v": ". Every choice, from what to eat to which email to answer first, draws from the same limited pool of mental energy. By evening, that pool runs dry, a state researchers call " },
          { "t": "bold", "v": "decision fatigue" },
          { "t": "text", "v": "." }
        ]],
        "vi": [[
          { "t": "text", "v": "Theo dữ liệu từ " },
          { "t": "cite", "v": "CNBC (2025)", "sourceId": "cnbc-2025" },
          { "t": "text", "v": ", một người trưởng thành đưa ra khoảng " },
          { "t": "hl", "v": "35.000 quyết định mỗi ngày", "color": "pink" },
          { "t": "text", "v": ". Mỗi lựa chọn, từ ăn gì đến trả lời email nào trước, đều rút từ cùng một \"bình\" năng lượng tinh thần có hạn. Đến tối, bình cạn — trạng thái mà các nhà nghiên cứu gọi là " },
          { "t": "bold", "v": "mệt mỏi quyết định" },
          { "t": "text", "v": " (" },
          { "t": "italic", "v": "decision fatigue" },
          { "t": "text", "v": ")." }
        ]]
      }
    },
    {
      "variant": "body",
      "body": {
        "en": [[
          { "t": "text", "v": "Nobel Prize-winning psychologist " },
          { "t": "bold", "v": "Daniel Kahneman" },
          { "t": "text", "v": ", in his book " },
          { "t": "italic", "v": "Thinking, Fast and Slow" },
          { "t": "text", "v": " " },
          { "t": "hl", "v": "(2011)", "color": "yellow" },
          { "t": "text", "v": ", describes two modes of thinking: " },
          { "t": "bold", "v": "System 1" },
          { "t": "text", "v": " operates fast, automatically, and intuitively, while " },
          { "t": "bold", "v": "System 2" },
          { "t": "text", "v": " is slow, conscious, and analytical. About " },
          { "t": "hl", "v": "95% of everyday decisions", "color": "pink" },
          { "t": "text", "v": " are driven by System 1. That is not inherently bad, but it makes us vulnerable to " },
          { "t": "bold", "v": "cognitive biases" },
          { "t": "text", "v": "." }
        ]]
      }
    }
  ],
  "keyPoint": {
    "en": [[
      { "t": "text", "v": "Making smarter decisions is like " },
      { "t": "hl", "v": "learning to drive", "color": "pink" },
      { "t": "text", "v": ". At first, you have to think through every single move. Over time, it becomes a reflex. Start with something small today: with your next decision, ask yourself, " },
      { "t": "italic", "v": "is this a one-way door or a two-way door?" }
    ]]
  },
  "sources": [
    { "id": "cnbc-2025", "label": "CNBC (2025)", "publisher": "CNBC", "year": 2025, "url": "https://www.cnbc.com/" },
    { "id": "kahneman-2011", "label": "Kahneman (2011)", "publisher": "Farrar, Straus and Giroux", "year": 2011, "url": "https://us.macmillan.com/books/9780374533557/thinkingfastandslow" },
    { "id": "pmc-nih-2022", "label": "PMC/NIH (2022)", "publisher": "PubMed Central", "year": 2022, "url": "https://www.ncbi.nlm.nih.gov/pmc/" },
    { "id": "amazon-2016", "label": "Amazon (2016)", "publisher": "Amazon Shareholder Letter", "year": 2016, "url": "https://www.aboutamazon.com/news/company-news/2016-letter-to-shareholders" }
  ],
  "applySteps": {
    "en": [
      "Before your next decision, label it: one-way door or two-way door. If two-way, decide in under 2 minutes.",
      "Write down one piece of evidence that could prove your current opinion wrong.",
      "Move tomorrow's most important decision to the first 2 hours of your morning."
    ],
    "vi": [
      "Trước quyết định tiếp theo, gắn nhãn: cửa một chiều hay hai chiều. Nếu hai chiều, quyết trong dưới 2 phút.",
      "Viết ra một bằng chứng có thể chứng minh ý kiến hiện tại của bạn là sai.",
      "Dời quyết định quan trọng nhất ngày mai vào 2 giờ đầu buổi sáng."
    ]
  },
  "wordCount": 560,
  "counts": { "likes": 329, "saves": 170, "shares": 30, "comments": 0 },
  "rank": 100,
  "status": "published",
  "publishedAt": "2026-10-01T00:00:00Z"
}
```

> Ghi chú: các URL nguồn trong seed là trang gốc của nhà xuất bản; trước khi phát hành nội dung thật, biên tập viên phải thay bằng link bài/nghiên cứu cụ thể và kiểm chứng số liệu (đặc biệt con số "35,000 decisions a day", vốn là ước tính phổ biến, không phải kết quả nghiên cứu chặt chẽ).

## 4. Bài seed bổ sung cần có cho M1 (để test lướt dọc)

| slug | category | Tiêu đề EN | Cover |
|------|----------|-----------|-------|
| `smarter-decisions` | psychology | How to make smarter decisions more easily? | image |
| `dopamine-scrolling` | science | Why can't you stop scrolling? Meet dopamine | video |
| `compound-interest-habits` | economics | Compound interest works on habits too | image |
| `loneliness-epidemic` | society | Why are we lonelier than ever in a connected world? | image |
| `sleep-memory` | health | What your brain does with memories while you sleep | video |

Bốn bài sau chỉ cần đủ hook + 3 section + KEY POINT + 3 apply steps ở M1–M2; hoàn thiện song ngữ ở M6.
