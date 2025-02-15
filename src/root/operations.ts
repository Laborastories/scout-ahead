import { type UpdateCurrentUserLastActiveTimestamp } from 'wasp/server/operations'
import { type User } from 'wasp/entities'
import { HttpError } from 'wasp/server'

export const updateCurrentUserLastActiveTimestamp: UpdateCurrentUserLastActiveTimestamp<
  void,
  User
> = async (_args, context) => {
  if (!context.user) {
    throw new HttpError(401)
  }

  return context.entities.User.update({
    where: {
      id: context.user.id,
    },
    data: {
      lastActiveTimestamp: new Date(),
    },
  })
}
