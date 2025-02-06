import { type UpdateCurrentUser } from 'wasp/server/operations'
import { type User } from 'wasp/entities'
import { HttpError } from 'wasp/server'

export const updateCurrentUser: UpdateCurrentUser<Partial<User>, User> = async (
  user,
  context,
) => {
  if (!context.user) {
    throw new HttpError(401)
  }

  return context.entities.User.update({
    where: {
      id: context.user.id,
    },
    data: user,
  })
}
