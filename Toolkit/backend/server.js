import express from 'express'
import cors from 'cors'
import { diffWords } from 'diff'

const app = express()
app.use(cors())
app.use(express.json())

// Keep only the text comparison endpoints
app.post('/api/compare-articles', async (req, res) => {
  try {
    const { baseText, comparisonText } = req.body
    
    if (!baseText || !comparisonText) {
      return res.status(400).json({ 
        error: 'Both baseText and comparisonText are required' 
      })
    }

    const diff = diffWords(baseText, comparisonText)
    
    let html = '<div class="LegSnippet">'
    diff.forEach(part => {
      if (part.added) {
        html += `<span class="LegAddition" style="background-color: #e6ffe6;">${part.value}</span>`
      } else if (part.removed) {
        html += `<span class="LegRepeal" style="background-color: #ffe6e6; text-decoration: line-through;">${part.value}</span>`
      } else {
        html += part.value
      }
    })
    html += '</div>'

    res.json({ html })
  } catch (error) {
    console.error('Error comparing articles:', error)
    res.status(500).json({ 
      error: 'Failed to compare articles',
      details: error.message 
    })
  }
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})