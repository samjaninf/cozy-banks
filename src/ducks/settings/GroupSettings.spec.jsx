import React from 'react'
import { GroupSettings, AccountsList } from './GroupSettings'
import { render, fireEvent, act } from '@testing-library/react'
import { createMockClient } from 'cozy-client/dist/mock'
import AppLike from 'test/AppLike'
import fixtures from 'test/fixtures'
import omit from 'lodash/omit'
import cloneDeep from 'lodash/cloneDeep'
import { schema } from 'doctypes'

const fixtureGroup = fixtures['io.cozy.bank.groups'][0]

jest.mock('components/BackButton', () => () => null)

const createClient = () => {
  const client = new createMockClient({
    queries: {},
    clientOptions: {
      schema
    }
  })
  client.save = jest.fn().mockResolvedValue({ data: { id: '1234' } })
  return client
}

const setup = ({ group, client: clientOption }) => {
  const client = clientOption || createClient()
  const account = fixtures['io.cozy.bank.accounts'][0]
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    go: jest.fn(),
    goBack: jest.fn(),
    goForward: jest.fn(),
    setRouteLeaveHook: jest.fn(),
    isActive: jest.fn(),
    params: {
      groupId: '1234'
    }
  }

  const root = render(
    <AppLike router={router} client={client}>
      <GroupSettings
        account={account}
        group={group}
        router={router}
        client={client}
        breakpoints={{ isMobile: false }}
      />
    </AppLike>
  )
  return { router, client, root }
}

describe('GroupSettings', () => {
  const rename = async (root, newName) => {
    const modifyBtn = root.getByText('Rename')
    await fireEvent.click(modifyBtn)
    const input = root.getByPlaceholderText('My group')
    await fireEvent.change(input, { target: { value: newName } })
    const saveBtn = root.getByText('Save')
    await act(async () => {
      fireEvent.click(saveBtn)
    })
  }

  it('should rename new group', async () => {
    const group = omit(fixtures['io.cozy.bank.groups'][0], ['_id', 'id'])
    const { router, client, root } = setup({ group })
    await rename(root, 'Renamed group')
    expect(client.save).toHaveBeenCalledWith({
      accounts: ['compteisa1', 'comptelou1', 'comptecla1', 'comptegene1'],
      label: 'Renamed group'
    })
    expect(router.push).toHaveBeenCalledWith('/settings/groups/1234')
  })

  it('should rename autogroup', async () => {
    const group = {
      ...fixtures['io.cozy.bank.groups'][0],
      accountType: 'Checkings'
    }
    const { router, client, root } = setup({ group })
    await rename(root, 'Renamed group')
    expect(client.save).toHaveBeenCalledWith({
      _id: 'familleelargie',
      accountType: null,
      accounts: ['compteisa1', 'comptelou1', 'comptecla1', 'comptegene1'],
      id: 'familleelargie',
      label: 'Renamed group'
    })
    expect(router.push).not.toHaveBeenCalled()
  })

  const setupAccountList = ({ accounts, group, client }) => {
    const root = render(
      <AppLike client={client}>
        <AccountsList accounts={accounts} group={group} />
      </AppLike>
    )

    return { root, client }
  }

  it('should be possible to toggle an account from a group', async () => {
    const rawGroup = {
      _type: 'io.cozy.bank.groups',
      ...cloneDeep(fixtureGroup)
    }
    const client = createClient()
    client.save = jest.fn()
    const group = client.hydrateDocument(rawGroup)
    const account = fixtures['io.cozy.bank.accounts'][0]
    const { root } = setupAccountList({
      client,
      accounts: [account],
      group
    })

    const sw = root.getByRole('checkbox')
    expect(sw.checked).toBe(false)
    expect(group.accounts.data.length).toBe(4)

    await act(async () => {
      fireEvent.click(sw, { target: { value: false } })
    })

    const sw2 = root.getByRole('checkbox')
    expect(group.accounts.data.length).toBe(5)
    expect(sw2.checked).toBe(true)
  })

  it('should be possible to toggle an account from a group (save fails)', async () => {
    jest.spyOn(console, 'warn').mockImplementation()
    const rawGroup = {
      _type: 'io.cozy.bank.groups',
      ...cloneDeep(fixtureGroup)
    }
    const client = createClient()
    client.save = jest.fn().mockRejectedValue('Error')

    const group = client.hydrateDocument(rawGroup)
    const account = fixtures['io.cozy.bank.accounts'][0]
    const { root } = setupAccountList({
      client,
      accounts: [account],
      group
    })

    const sw = root.getByRole('checkbox')
    expect(sw.checked).toBe(false)

    await act(async () => {
      fireEvent.click(sw, { target: { value: false } })
    })
    expect(client.save).toHaveBeenCalled()

    const sw2 = root.getByRole('checkbox')
    expect(sw2.checked).toBe(false)
  })
})
