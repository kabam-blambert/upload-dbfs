import {uploadDbfsFile} from '../packages/main/src/upload-dbfs'
import {
  DATABRICKS_HOST,
  TOKEN,
  getRequestMock,
  mockApiRequest,
  setupExpectedApiCalls,
  getSetOutputMock,
  getSaveStateMock
} from './test-utils'
import {
  DATABRICKS_DBFS_DESTINATION_PATH_OUTPUT_KEY,
  DBFS_TMP_DIR_STATE_KEY,
  DBFS_UPLOAD_MAX_BYTES_PER_BLOCK
} from '../packages/common/src/constants'
import {Buffer} from 'buffer'
import * as fs from 'fs'
import path from 'path'
import {getDbfsTempDir} from '../packages/common/src/utils'
import {runMain} from '../packages/main/src/run-main'

jest.mock('@actions/core', () => {
  return {
    ...jest.requireActual('@actions/core'),
    setFailed: jest.fn(),
    setOutput: jest.fn(),
    saveState: jest.fn()
  }
})

// Needs to be at top level of module so that the module-mocking is hoisted
// See https://jestjs.io/docs/manual-mocks#using-with-es-module-imports for details
jest.mock('../packages/common/src/request')

jest.mock('crypto', () => {
  return {
    ...jest.requireActual('crypto'),
    randomUUID: () => 'MOCK_UUID_FOR_TESTS'
  }
})
const mockUuid = 'MOCK_UUID_FOR_TESTS'

describe('upload-dbfs integration tests', () => {
  const handle = 12345

  let perTestTmpDir: string
  beforeEach(() => {
    perTestTmpDir = fs.mkdtempSync('upload-dbfs-tests')
  })

  afterEach(() => {
    jest.restoreAllMocks()
    fs.rmSync(perTestTmpDir, {recursive: true})
  })
  test.each([
    {
      dbfsTempDir: 'dbfs:/databricks-github-actions',
      filePath: '__tests__/resources/python-egg.egg',
      expectedAddBlocks: ['cHJpbnQoIkhlbGxvIHdvcmxkIikK'],
      expectedDbfsUploadPath: `dbfs:/databricks-github-actions/python-egg.egg`
    },
    {
      dbfsTempDir: 'dbfs:/databricks-github-actions/',
      filePath: '__tests__/resources/python-wheel.whl',
      expectedAddBlocks: ['cHJpbnQoIkhlbGxvIHdvcmxkIikK'],
      expectedDbfsUploadPath: `dbfs:/databricks-github-actions/python-wheel.whl`
    },
    {
      dbfsTempDir: 'dbfs:/databricks-github-actions/',
      filePath: '__tests__/resources/scala-jar.jar',
      expectedAddBlocks: ['cHJpbnRsbigiSGVsbG8gd29ybGQiKQo='],
      expectedDbfsUploadPath: `dbfs:/databricks-github-actions/scala-jar.jar`
    },
    {
      dbfsTempDir: 'dbfs:/databricks-github-actions/',
      filePath: '__tests__/resources/data-file.csv',
      expectedAddBlocks: ['bmFtZSxhZ2UKRnJhbmssMzAK'],
      expectedDbfsUploadPath: `dbfs:/databricks-github-actions/data-file.csv`
    },
    {
      dbfsTempDir: 'dbfs:/databricks-github-actions/',
      filePath: '__tests__/resources/helloworld-0.1-py2.py3-none-any.whl',
      expectedAddBlocks: [
        'UEsDBBQAAAAIAPqxjFQy8tbEPgAAAEwAAAAWAAAAaGVsbG93b3JsZC9fX2luaXRfXy5weUvOSSwuVvBIzcnJ18hPykpNLtG04lIAgpTUNIXixMr4DLBUcWpOGlQCBIpSS0qL8hSUwPp0FMLzi3JSFJUAUEsDBBQAAAAIADy2jFT6M/QpogAAANAAAAAhAAAAaGVsbG93b3JsZC0wLjEuZGlzdC1pbmZvL01FVEFEQVRBRY7LDoIwFET39yv6A4CPuGmiCTsSBYlGWV/hSpu0FNuShr+3mKjbOTMnU5LHDj0md7JOmoGzTbqGCjVxJkgpE4xVHfzoKtLrpDXambNiKbBmaTBPzsuhZ0EoKIymZMR+cXg/8iwLIaQfXdoaDfnkhbGclUagxo7lFh8STrKlwcXNrTpW56aCWqF/Gqv/yYVek7TkknqOhnjnsN+mO4AvB3gDUEsDBBQAAAAIADy2jFSr+sidXwAAAG4AAAAeAAAAaGVsbG93b3JsZC0wLjEuZGlzdC1pbmZvL1dIRUVMC89ITc3RDUstKs7Mz7NSMNQz4HJPzUstSizJL7JSSErJLC6JLwepUdAw0DM20zPS5ArKzy/R9SzWDSgtSs3JTLJSKCkqTeUKSUy3UiioNNLNy89L1U3Mq4SJGCNEuABQSwMEFAAAAAgAPLaMVOYySZoNAAAACwAAACYAAABoZWxsb3dvcmxkLTAuMS5kaXN0LWluZm8vdG9wX2xldmVsLnR4dMtIzcnJL88vyknhAgBQSwMEFAAAAAgAPLaMVMfl3Rr+AAAAewEAAB8AAABoZWxsb3dvcmxkLTAuMS5kaXN0LWluZm8vUkVDT1JEdcw5doJAAADQ3rMAssiSwgIYQEVQBFRo5kV2nQyoLAOnTxrS+Q/wywyheqhfKF1CWOGqhZBpRupdfvOitO6lPcnNsFCxhV0dvWhHqM/nCAlSrApd7jxuYAThMzPCLSVLi/I/o1mGY9Lq3dIVzuulYwQqUAN1fgvbGbayRiyIOcRPPrLNkO+TCJiJWl4LdPy6iaSbfHJZUTyrfI4vG8PYz2tM4zFqhlfiP0medkR0bhgCT+TF6ijveGAJu8LqD9EYeBTHsZ/Xtm4gyvoMMS1p5/3uavCAoHgfm9WkuD9DQJMt3bl2srFdJUuVWNOv5y7zHuzf/jk/GfrhBChq8QtQSwECFAMUAAAACAD6sYxUMvLWxD4AAABMAAAAFgAAAAAAAAAAAAAApIEAAAAAaGVsbG93b3JsZC9fX2luaXRfXy5weVBLAQIUAxQAAAAIADy2jFT6M/QpogAAANAAAAAhAAAAAAAAAAAAAACkgXIAAABoZWxsb3dvcmxkLTAuMS5kaXN0LWluZm8vTUVUQURBVEFQSwECFAMUAAAACAA8toxUq/rInV8AAABuAAAAHgAAAAAAAAAAAAAApIFTAQAAaGVsbG93b3JsZC0wLjEuZGlzdC1pbmZvL1dIRUVMUEsBAhQDFAAAAAgAPLaMVOYySZoNAAAACwAAACYAAAAAAAAAAAAAAKSB7gEAAGhlbGxvd29ybGQtMC4xLmRpc3QtaW5mby90b3BfbGV2ZWwudHh0UEsBAhQDFAAAAAgAPLaMVMfl3Rr+AAAAewEAAB8AAAAAAAAAAAAAALQBPwIAAGhlbGxvd29ybGQtMC4xLmRpc3QtaW5mby9SRUNPUkRQSwUGAAAAAAUABQCAAQAAegMAAAAA'
      ],
      expectedDbfsUploadPath: `dbfs:/databricks-github-actions/helloworld-0.1-py2.py3-none-any.whl`
    }
  ])(
    'create temporary directory and upload notebook (file path = $filePath, dbfsTempDir =' +
      ' $dbfsTempDir)',
    async ({
      dbfsTempDir,
      filePath,
      expectedAddBlocks,
      expectedDbfsUploadPath
    }) => {
      const expectedCalls = [
        mockApiRequest(
          '/api/2.0/dbfs/create',
          'POST',
          {path: expectedDbfsUploadPath},
          200,
          {handle}
        )
      ]
        .concat(
          expectedAddBlocks.map(blockContent =>
            mockApiRequest(
              '/api/2.0/dbfs/add-block',
              'POST',
              {handle, data: blockContent},
              200,
              {}
            )
          )
        )
        .concat([
          mockApiRequest('/api/2.0/dbfs/close', 'POST', {handle}, 200, {})
        ])
      setupExpectedApiCalls(expectedCalls)
      await uploadDbfsTempfile(DATABRICKS_HOST, TOKEN, filePath, dbfsTempDir)
      const apiMock = getRequestMock()
      expect(apiMock).toBeCalledTimes(2 + expectedAddBlocks.length)
    }
  )

  test('upload-dbfs-tempfile: handles API failures and closes handle', async () => {
    const expectedDbfsUploadPath = `dbfs:/tmp/databricks-actions/python-egg.egg`
    const localPath = '__tests__/resources/python-egg.egg'
    setupExpectedApiCalls([
      mockApiRequest(
        '/api/2.0/dbfs/create',
        'POST',
        {path: expectedDbfsUploadPath},
        200,
        {handle}
      ),
      mockApiRequest(
        '/api/2.0/dbfs/add-block',
        'POST',
        {handle, data: 'cHJpbnQoIkhlbGxvIHdvcmxkIikK'},
        400,
        {error_code: 'BAD_REQUEST', message: 'Bad API request'}
      ),
      mockApiRequest('/api/2.0/dbfs/close', 'POST', {handle}, 200, {})
    ])
    await expect(async () => {
      return await uploadDbfsTempfile(
        DATABRICKS_HOST,
        TOKEN,
        localPath,
        'dbfs:/tmp/databricks-actions'
      )
    }).rejects.toThrow(
      new Error(
        'Request failed with error code 400. Response body: {"error_code":"BAD_REQUEST","message":"Bad API request"}'
      )
    )
    const apiMock = getRequestMock()
    expect(apiMock).toBeCalledTimes(3)
  })

  test('Uploads large files in multiple chunks', async () => {
    const contents = 'a'.repeat(DBFS_UPLOAD_MAX_BYTES_PER_BLOCK + 1)
    const tmpFile = path.join(perTestTmpDir, 'python-egg.egg')
    fs.writeFileSync(tmpFile, contents)
    const dbfsTempDir = 'dbfs:/databricks-github-actions'
    const expectedDbfsUploadPath = `dbfs:/databricks-github-actions/python-egg.egg`
    const expectedAddBlocks = [
      new Buffer(contents.slice(0, DBFS_UPLOAD_MAX_BYTES_PER_BLOCK)).toString(
        'base64'
      ),
      new Buffer(
        contents.slice(DBFS_UPLOAD_MAX_BYTES_PER_BLOCK, contents.length)
      ).toString('base64')
    ]
    setupExpectedApiCalls(
      [
        mockApiRequest(
          '/api/2.0/dbfs/create',
          'POST',
          {path: expectedDbfsUploadPath},
          200,
          {handle}
        )
      ]
        .concat(
          expectedAddBlocks.map(blockContent =>
            mockApiRequest(
              '/api/2.0/dbfs/add-block',
              'POST',
              {handle, data: blockContent},
              200,
              {}
            )
          )
        )
        .concat([
          mockApiRequest('/api/2.0/dbfs/close', 'POST', {handle}, 200, {})
        ])
    )
    await uploadDbfsTempfile(DATABRICKS_HOST, TOKEN, tmpFile, dbfsTempDir)
    const apiMock = getRequestMock()
    expect(apiMock).toBeCalledTimes(2 + expectedAddBlocks.length)
  })
})

describe('upload-dbfs-tempfile main step utils', () => {
  afterEach(() => {
    delete process.env['INPUT_DBFS-TEMP-DIR']
  })

  test('getDbfsTempDir util reads input', () => {
    const dbfsPath = 'dbfs:/tmp/path'
    process.env['INPUT_DBFS-TEMP-DIR'] = dbfsPath
    expect(getDbfsTempDir()).toEqual(dbfsPath)
  })

  test.each([
    {
      invalidDbfsPath: 'some/local/path'
    },
    {
      invalidDbfsPath: '/some/absolute/path'
    }
  ])(
    'getDbfsTempDir util throws if invalid DBFS path = $invalidDbfsPath is supplied',
    ({invalidDbfsPath}) => {
      process.env['INPUT_DBFS-TEMP-DIR'] = invalidDbfsPath
      expect(getDbfsTempDir).toThrow(
        new Error(
          `dbfs-temp-dir input must be a DBFS path starting with 'dbfs:/'. Got invalid path ${invalidDbfsPath}`
        )
      )
    }
  )
})

describe('upload-dbfs-tempfile integration tests', () => {
  const dbfsTempDir = 'dbfs:/databricks-github-actions/'
  const filePath = '__tests__/resources/scala-jar.jar'
  const expectedAddBlocks = ['cHJpbnRsbigiSGVsbG8gd29ybGQiKQo=']
  const expectedDbfsUploadDir = `dbfs:/databricks-github-actions`
  const expectedDbfsUploadPath = `${expectedDbfsUploadDir}/scala-jar.jar`
  const handle = 123

  afterEach(() => {
    delete process.env['INPUT_DBFS-TEMP-DIR']
    delete process.env['INPUT_LOCAL-PATH']
    delete process.env['INPUT_DATABRICKS-HOST']
    delete process.env['INPUT_DATABRICKS-TOKEN']
    jest.resetAllMocks()
  })

  test('upload-dbfs-tempfile reads inputs, uploads file, and sets output', async () => {
    process.env['INPUT_DBFS-TEMP-DIR'] = dbfsTempDir
    process.env['INPUT_LOCAL-PATH'] = filePath
    process.env['INPUT_DATABRICKS-HOST'] = DATABRICKS_HOST
    process.env['INPUT_DATABRICKS-TOKEN'] = TOKEN
    const expectedCalls = [
      mockApiRequest(
        '/api/2.0/dbfs/create',
        'POST',
        {path: expectedDbfsUploadPath},
        200,
        {handle}
      )
    ]
      .concat(
        expectedAddBlocks.map(blockContent =>
          mockApiRequest(
            '/api/2.0/dbfs/add-block',
            'POST',
            {handle, data: blockContent},
            200,
            {}
          )
        )
      )
      .concat([
        mockApiRequest('/api/2.0/dbfs/close', 'POST', {handle}, 200, {})
      ])
    setupExpectedApiCalls(expectedCalls)
    await runMain()
    const apiMock = getRequestMock()
    expect(apiMock).toBeCalledTimes(2 + expectedAddBlocks.length)
    expect(getSetOutputMock()).toBeCalledWith(
      DATABRICKS_DBFS_DESTINATION_PATH_OUTPUT_KEY,
      expectedDbfsUploadPath
    )
    expect(getSaveStateMock()).toBeCalledWith(
      DBFS_TMP_DIR_STATE_KEY,
      expectedDbfsUploadDir
    )
  })
})
