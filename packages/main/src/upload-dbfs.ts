import * as path from 'path'
import {ApiClient} from '../../common/src/api-client'

const getDbfsUploadDirectory = (dbfsTmpDir: string): string => {
  const baseDir = dbfsTmpDir.endsWith('/') ? dbfsTmpDir : `${dbfsTmpDir}/`
  return baseDir
}

export async function uploadDbfsFile(
  databricksHost: string,
  databricksToken: string,
  localPath: string,
  dbfsDir: string
): Promise<{dbfsUploadDirectory: string; dbfsUploadPath: string}> {
  if (!dbfsDir.startsWith('dbfs:/')) {
    throw new Error(
      `Got invalid dbfs-dir input "${dbfsDir}". dbfs-dir input must start with "dbfs:/"`
    )
  }
  const dbfsUploadDirectory = getDbfsUploadDirectory(dbfsDir)
  const dbfsPath = `${dbfsUploadDirectory}${path.basename(localPath)}`
  const apiClient = new ApiClient(databricksHost, databricksToken)
  await apiClient.dbfsUpload(localPath, dbfsPath)
  return {dbfsUploadDirectory, dbfsUploadPath: dbfsPath}
}
