import NotificationView from '../BaseNotificationView'
import { isHealthExpense } from 'ducks/categories/helpers'
import { keyBy, uniq } from 'lodash'
import logger from 'cozy-logger'
import { BankTransaction, BankAccount } from 'cozy-doctypes'
import {
  isReimbursementLate,
  isAlreadyNotified
} from 'ducks/transactions/helpers'
import { subDays, subMonths, format as formatDate } from 'date-fns'
import { Bill } from 'models'
import { getReimbursementBillId, getReimbursementBillIds } from '../helpers'
import templateRaw from './template.hbs'
import { prepareTransactions, getCurrentDate } from 'ducks/notifications/utils'
import { toText } from 'cozy-notifications'

const log = logger.namespace('lateHealthReimbursement')

const ACCOUNT_SEL = '.js-account'
const DATE_SEL = '.js-date'
const TRANSACTION_SEL = '.js-transaction'

/**
 * Transforms the HTML email to its text version by extracting the relevant
 * content
 */
const customToText = cozyHTMLEmail => {
  const getTextTransactionRow = $row =>
    $row
      .find('td')
      .map((i, td) =>
        $row
          .find(td)
          .text()
          .trim()
      )
      .toArray()
      .join(' ')
      .replace(/\n/g, '')
      .replace(' €', '€')
      .trim()

  const getContent = $ =>
    $([ACCOUNT_SEL, DATE_SEL, TRANSACTION_SEL].join(', '))
      .toArray()
      .map(node => {
        const $node = $(node)
        if ($node.is(ACCOUNT_SEL)) {
          return '\n\n### ' + $node.text()
        } else if ($node.is(DATE_SEL)) {
          return '\n' + $node.text() + '\n'
        } else if ($node.is(TRANSACTION_SEL)) {
          return '- ' + getTextTransactionRow($node)
        }
      })
      .join('\n')
  return toText(cozyHTMLEmail, getContent)
}

class LateHealthReimbursement extends NotificationView {
  constructor(config) {
    super(config)
    this.interval = config.value
  }

  async getTransactions() {
    const DATE_FORMAT = 'YYYY-MM-DD'
    const today = new Date()
    const lt = formatDate(subDays(today, this.interval), DATE_FORMAT)
    const gt = formatDate(subMonths(lt, 6), DATE_FORMAT)

    log('info', `Fetching transactions between ${gt} and ${lt}`)
    const transactionsInDateRange = await BankTransaction.queryAll({
      date: {
        $gt: gt,
        $lt: lt
      }
    })
    log(
      'info',
      `${
        transactionsInDateRange.length
      } fetched transactions between ${gt} and ${lt}`
    )

    const healthExpenses = transactionsInDateRange.filter(isHealthExpense)

    log('info', `${healthExpenses.length} are health expenses`)

    const billIds = getReimbursementBillIds(healthExpenses)
    const bills = await Bill.getAll(billIds)
    const billsById = keyBy(bills, bill => bill._id)

    // We emulate the cozy-client relationships format manually, since we
    // don't use cozy-client in the services for now
    const enhancedHealthExpenses = healthExpenses.map(expense => {
      if (!expense.reimbursements) {
        return expense
      }

      return {
        ...expense,
        reimbursements: {
          data: expense.reimbursements.map(r => ({
            ...r,
            ...billsById[getReimbursementBillId(r)]
          }))
        }
      }
    })

    // We want to work with transactions without fake cozy-client relationships
    // so we get original transactions from filtered enhanced transactions
    const healthExpensesById = keyBy(healthExpenses, h => h._id)

    const lateReimbursements = enhancedHealthExpenses
      .filter(isReimbursementLate)
      .map(t => healthExpensesById[t._id])

    log('info', `${lateReimbursements.length} are late health reimbursements`)

    const toNotify = lateReimbursements.filter(
      lateReimbursement =>
        !isAlreadyNotified(lateReimbursement, LateHealthReimbursement)
    )

    log('info', `${toNotify} need to be notified`)

    this.toNotify = toNotify

    return toNotify
  }

  getAccounts(transactions) {
    const accountIds = uniq(
      transactions.map(transaction => transaction.account)
    )

    return BankAccount.getAll(accountIds)
  }

  async fetchData() {
    const transactions = await this.getTransactions()

    if (transactions.length === 0) {
      log('info', 'No late health reimbursement')
      return
    }

    log('info', `${transactions.length} late health reimbursements`)

    log('info', 'Fetching accounts for late health reimbursements')
    const accounts = await this.getAccounts(transactions)
    log(
      'info',
      `${accounts.length} accounts fetched for late health reimbursements`
    )

    return { transactions, accounts }
  }

  async buildData() {
    const { transactions, accounts } = await this.fetchData()
    const accountsById = keyBy(accounts, '_id')
    const transactionsByAccounts = prepareTransactions(transactions)

    return {
      accounts: accountsById,
      byAccounts: transactionsByAccounts,
      date: getCurrentDate(),
      transactions: transactions,
      ...this.urls
    }
  }

  getTitle() {
    return this.t(
      'Notifications.when_late_health_reimbursement.notification.content.title'
    )
  }

  getPushContent(templateData) {
    const { transactions } = templateData
    return this.t(
      'Notifications.when_late_health_reimbursement.notification.content.message',
      { smart_count: transactions.length }
    )
  }

  /**
   * Executed by `Notification` when the notification has been successfuly sent
   * See `Notification::sendNotification`
   */
  async onSendNotificationSuccess() {
    this.toNotify.forEach(reimb => {
      if (!reimb.cozyMetadata) {
        reimb.cozyMetadata = {}
      }

      if (!reimb.cozyMetadata.notifications) {
        reimb.cozyMetadata.notifications = {}
      }

      const today = new Date()
      reimb.cozyMetadata.notifications[LateHealthReimbursement.settingKey] = [
        today.toISOString()
      ]
    })

    await BankTransaction.updateAll(this.toNotify)
  }
}

LateHealthReimbursement.toText = customToText
LateHealthReimbursement.category = 'late-health-reimbursement'
LateHealthReimbursement.template = templateRaw
LateHealthReimbursement.settingKey = 'lateHealthReimbursement'
LateHealthReimbursement.preferredChannels = ['mobile', 'mail']

export default LateHealthReimbursement
