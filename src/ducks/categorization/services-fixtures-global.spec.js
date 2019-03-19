import { globalModel, BankClassifier } from './services'
import { tokenizer } from '.'
import { Transaction } from '../../models'
const path = require('path')
// const fs = require('fs')

const cat2name = require('../categories/tree.json')
const allowedFallbackCategories = require('./allowed_wrong_categories.json')

const fixturePath = path.join(__dirname, 'fixtures')

const BACKUP_DIR = process.env.BACKUP_DIR
const IT_IS_A_TEST = process.env.IT_IS_A_TEST

const softRequire = file => {
  try {
    return require(file)
  } catch (e) {
    return undefined
  }
}

const globalModelJSON = softRequire('./bank_classifier_nb_and_voc.json')
const xOrDescribe = globalModelJSON ? describe : xdescribe

let banks
if (IT_IS_A_TEST) {
  banks = ['flotest60.cozy.rocks']
} else {
  banks = [
    'francoistest1.mycozy.cloud',
    'flotest60.cozy.rocks',
    'anonymous1.mycozy.cloud',
    'fabien.mycozy.cloud'
  ]
}

const STATUS_OK = 'WELL_CATEGORIZED'
const STATUS_OK_FALLBACK = 'ALMOST_WELL_CATEGORIZED'
const STATUS_KO = 'BADLY_CATEGORIZED'
const STATUS_UNCATEGORIZED = 'NOT_CATEGORIZED'

const ICONE_OK = '✅'
const ICONE_OK_FALLBACK = '🆗'
const ICONE_KO = '❌'
const ICONE_UNCATEGORIZED = '⚠️'
const ICONE_MANUAL_CATEGORIZATION = '✍️'

// Prepare the historized tracking
const today = new Date()
let dd = today.getDate()
let mm = today.getMonth() + 1
const yyyy = today.getFullYear()
if (dd < 10) {
  dd = '0' + dd
}
if (mm < 10) {
  mm = '0' + mm
}

let csvWriter
const setCsvWriter = () => {
  const createCsvWriter = require('csv-writer').createObjectCsvWriter
  const csvPath = path.join(
    BACKUP_DIR,
    `results-globalStandalone-${yyyy}-${mm}-${dd}.csv`
  )
  csvWriter = createCsvWriter({
    path: csvPath,
    header: [
      { id: 'manCat', title: 'Manual recategorization' },
      { id: 'status', title: 'Status' },
      { id: 'amount', title: 'Amount' },
      { id: 'label', title: 'Label' },
      { id: 'catNameDisplayed', title: 'Category displayed' },
      { id: 'catNameTrue', title: 'True category' }
    ]
  })
}

const checkGlobalCategorization = transactions => {
  return transactions.map(op => {
    const { trueCategoryId, cozyCategoryId, trueCatId } = op
    // embed results informations
    let status
    // check result as seen by user
    if (trueCategoryId === '0') {
      status = STATUS_UNCATEGORIZED
    } else {
      // get the allowed fallback categories for the true category
      const fallbackCategories = allowedFallbackCategories[trueCategoryId]
      if (cozyCategoryId === trueCategoryId) {
        status = STATUS_OK
      } else if (fallbackCategories.includes(cozyCategoryId)) {
        status = STATUS_OK_FALLBACK
      } else {
        status = STATUS_KO
      }
    }
    op.status = status
    op.catNameTrue = cat2name[trueCatId]
    op.catNameCozy = cat2name[cozyCategoryId]
    return op
  })
}

// const compare = (a, b) => {
//   if (a.label < b.label) return -1
//   if (a.label > b.label) return 1
//   return 0
// }

// const fmtManualCategorizations = manualCategorizations => {
//   const sortedManualCategorizations = manualCategorizations.sort(compare)
//   let countOfManualCategorizations = {}
//   // sum up every recategorizations
//   for (const op of sortedManualCategorizations) {
//     const key =
//       op.label.slice(0, 15) + op.automaticCategoryId + '>' + op.manualCategoryId
//     const operationsSummary = countOfManualCategorizations[key]
//     if (operationsSummary) {
//       countOfManualCategorizations[key] = {
//         occurrence: operationsSummary.occurrence + 1,
//         ...op
//       }
//     } else {
//       countOfManualCategorizations[key] = { occurrence: 1, ...op }
//     }
//   }
//   // display the summary
//   let fmtedManualCategorizations = []
//   for (const key of Object.keys(countOfManualCategorizations)) {
//     const op = countOfManualCategorizations[key]
//     const label = op.label
//     const manualCategoryName = cat2name[op.manualCategoryId]
//     const automaticCategoryName = cat2name[op.automaticCategoryId]
//     const formatedStr = `\t${
//       op.occurrence
//     } x <<${label}>>\t mapped from ${automaticCategoryName} to ${manualCategoryName}`
//     fmtedManualCategorizations.push(formatedStr)
//   }
//   const headOfSummary = [
//     `${manualCategorizations.length} Manual categorization for this fixture`
//   ]
//   const summary = headOfSummary.concat(fmtedManualCategorizations)
//   return summary
// }

const fmtAccuracy = accuracy => {
  const {
    nOperations,
    nWinCozy,
    nAlmostWinCozy,
    nFailCozy,
    nUncategorized
  } = accuracy
  let summaryStr = `On ${nOperations} operations:
    \t- ${ICONE_OK} : ${((100 * nWinCozy) / nOperations).toFixed(
    2
  )} % of good predictions
    \t- ${ICONE_OK_FALLBACK} : ${((100 * nAlmostWinCozy) / nOperations).toFixed(
    2
  )} % of almost good predictions
    \t- ${ICONE_KO} : ${((100 * nFailCozy) / nOperations).toFixed(
    2
  )} % of wrong predictions
    \t- ${ICONE_UNCATEGORIZED} : ${(
    (100 * nUncategorized) /
    nOperations
  ).toFixed(2)} % were uncategorized`
  return summaryStr
}

// const fmtFixtureSummary = (manualCategorizations, accuracy) => {
//   const fmtedAccuracy = fmtAccuracy(accuracy)
//   const fmtedManualCategorizations = fmtManualCategorizations(
//     manualCategorizations
//   )
//   return [fmtedAccuracy, fmtedManualCategorizations]
// }

const fmtResults = transactions => {
  const fmtedResults = transactions.map(op => {
    let fmtedResult = ''
    const { status, manualCategoryId } = op
    fmtedResult += manualCategoryId ? ICONE_MANUAL_CATEGORIZATION : ' '
    if (status === STATUS_UNCATEGORIZED) {
      fmtedResult += `${ICONE_UNCATEGORIZED}:`
      fmtedResult += ` (${op.amount}€)\t<<${
        op.label
      }>> was NOT categorized. Cozy predicted it as ${op.catNameCozy}`
    } else if (status === STATUS_OK) {
      fmtedResult += `${ICONE_OK}:`
      fmtedResult += ` (${op.amount}€)\t<<${
        op.label
      }>> - is properly predicted as ${op.catNameTrue}`
    } else if (status === STATUS_OK_FALLBACK) {
      fmtedResult += `${ICONE_OK_FALLBACK}:`
      fmtedResult += ` (${op.amount}€)\t<<${
        op.label
      }>> - is ALMOST properly predicted as ${
        op.catNameTrue
      } (user would have seen ${op.catNameCozy})`
    } else if (status === STATUS_KO) {
      fmtedResult += `${ICONE_KO}:`
      fmtedResult += ` (${op.amount}€)\t<<${
        op.label
      }>> - is NOT properly predicted as ${op.catNameTrue} ; Cozy said ${
        op.catNameCozy
      }`
    }
    return fmtedResult
  })
  return fmtedResults
}

// const fmtResultsCSV = transactions => {
//   const fmtedResults = transactions.map(op => {
//     const { status, method, amount, label, catNameDisplayed, catNameTrue } = op
//     let fmtedResult = {
//       manCat: op.manualCategoryId !== undefined,
//       method,
//       status,
//       amount,
//       label,
//       catNameDisplayed,
//       catNameTrue
//     }
//     return fmtedResult
//   })
//   const blankLine = {
//     manCat: ' ',
//     method: ' ',
//     status: ' ',
//     amount: ' ',
//     label: ' ',
//     catNameDisplayed: ' ',
//     catNameTrue: ' '
//   }
//   fmtedResults.push(blankLine)
//   return fmtedResults
// }

const computeAccuracy = transactions => {
  const nOperations = transactions.length
  let nWinCozy = 0
  let nAlmostWinCozy = 0
  let nFailCozy = 0
  let nUncategorized = 0
  transactions.map(op => {
    const { status } = op
    switch (status) {
      case STATUS_OK:
        nWinCozy += 1
        break
      case STATUS_OK_FALLBACK:
        nAlmostWinCozy += 1
        break
      case STATUS_KO:
        nFailCozy += 1
        break
      case STATUS_UNCATEGORIZED:
        nUncategorized += 1
        break
      default:
        break
    }
  })
  const accuracyByFrequency = {
    nOperations,
    nWinCozy,
    nAlmostWinCozy,
    nFailCozy,
    nUncategorized
  }
  return accuracyByFrequency
}

xOrDescribe('Chain of predictions', () => {
  // prepare mock
  let manualCategorizations = []
  beforeEach(() => {
    jest
      .spyOn(Transaction, 'queryAll')
      .mockImplementation(() => Promise.resolve(manualCategorizations))
    // Mock global model
    jest
      .spyOn(BankClassifier, 'fetchParameters')
      .mockImplementation(() => Promise.resolve(globalModelJSON))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // prepare CSV
  // let fixturesRecords = []

  // Prepare global metrics
  let nOperationsEveryFixtures = 0
  let nWinCozyEveryFixtures = 0
  let nAlmostWinCozyEveryFixtures = 0
  let nFailCozyEveryFixtures = 0
  let nUncategorizedEveryFixtures = 0
  // prepare loop over fixtures
  for (let bank of banks) {
    // check if fixture exists
    const expectedPath = path.join(
      fixturePath,
      `${bank}-clean-transactions.bi.json`
    )
    let transactions
    try {
      transactions = require(expectedPath)['io.cozy.bank.operations']
    } catch (error) {
      transactions = undefined
    }
    // if fixture exists : continue
    ;(transactions ? it : xit)(
      `should correctly predict transactions of ${bank}`,
      async () => {
        manualCategorizations = transactions.filter(
          op => op.manualCategoryId !== undefined
        )
        // launch global model
        await globalModel({ tokenizer }, transactions)
        // parse results to check result
        const results = checkGlobalCategorization(transactions)
        // Format results
        const fmtedResults = fmtResults(results)
        // Format results for the historized CSV
        // const fixtureCSV = fmtResultsCSV(results)
        // Add an accuracy metrics
        const currentAccuracy = computeAccuracy(results)
        expect(fmtAccuracy(currentAccuracy)).toMatchSnapshot()
        // tests
        expect(fmtedResults).toMatchSnapshot()
        // fixturesRecords = fixturesRecords.concat(fixtureCSV)
        // update global metrics
        const {
          nOperations,
          nWinCozy,
          nAlmostWinCozy,
          nFailCozy,
          nUncategorized
        } = currentAccuracy
        nOperationsEveryFixtures += nOperations
        nWinCozyEveryFixtures += nWinCozy
        nAlmostWinCozyEveryFixtures += nAlmostWinCozy
        nFailCozyEveryFixtures += nFailCozy
        nUncategorizedEveryFixtures += nUncategorized
      }
    )
  }

  it('Should give a correct global accuracy', () => {
    const globalAccuracy = {
      nOperations: nOperationsEveryFixtures,
      nWinCozy: nWinCozyEveryFixtures,
      nAlmostWinCozy: nAlmostWinCozyEveryFixtures,
      nFailCozy: nFailCozyEveryFixtures,
      nUncategorized: nUncategorizedEveryFixtures
    }
    // add global metrics to snapshot
    expect(fmtAccuracy(globalAccuracy)).toMatchSnapshot()
  })

  // it('Should write the historized CSV/txt onto the disk', () => {
  //   fs.copyFile(
  //     path.join(
  //       __dirname,
  //       '__snapshots__',
  //       `${path.basename(__filename)}.snap`
  //     ),
  //     path.join(BACKUP_DIR, `results-${yyyy}-${mm}-${dd}.txt`),
  //     err => {
  //       if (err) {
  //         throw err
  //       }
  //     }
  //   )
  //   if (!csvWriter) setCsvWriter()
  //   csvWriter.writeRecords(fixturesRecords).then(
  //     () => {
  //       expect(true).toBeTruthy()
  //     },
  //     () => {
  //       expect(false).toBeTruthy()
  //     }
  //   )
  // })
})
